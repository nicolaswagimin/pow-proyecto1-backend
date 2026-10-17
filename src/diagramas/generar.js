import { Code, ConnectError } from '@connectrpc/connect';
import { ProgressStage } from '../gen/codetodiagram/v1/diagram_pb.js';
import { llamarGeminiJson } from '../ia.js';
import { jsonAProto, tipoAJson } from './convertir.js';
import { INSTRUCCIONES_DIAGRAMA, construirPrompt } from './prompt.js';
import { validarDiagrama } from './validar.js';
import { miembrosSinRespaldo, nodosSinRespaldo } from './verificar.js';

// Gemini puede envolver el JSON en un bloque ```json o añadir una frase: se toma el objeto.
export function extraerJson(texto) {
  const inicio = texto.indexOf('{');
  const fin = texto.lastIndexOf('}');
  if (inicio === -1 || fin <= inicio) throw new Error('La IA no devolvió JSON.');
  return JSON.parse(texto.slice(inicio, fin + 1));
}

const TITULO_NEUTRO = {
  arquitectura: 'Diagrama de arquitectura',
  secuencia: 'Diagrama de secuencia',
  clases: 'Diagrama de clases',
};

const PROMETE_MIEMBROS = /atribut|m[eé]todo/i;

// El título no puede prometer lo que el tipo de diagrama no dibuja.
function revisarTitulo(diagrama) {
  if (diagrama.tipo === 'clases') return null;
  if (!PROMETE_MIEMBROS.test(`${diagrama.titulo} ${diagrama.descripcion}`)) return null;
  return (
    `El título o la descripción hablan de atributos o métodos, pero un diagrama de ${diagrama.tipo} ` +
    'no los muestra: describe solo lo que el diagrama dibuja.'
  );
}

function erroresDeFidelidad(diagrama, archivos) {
  const titulo = revisarTitulo(diagrama);
  return [
    ...(titulo ? [titulo] : []),
    ...nodosSinRespaldo(diagrama, archivos).map(
      ({ id, nombre }) =>
        `El nodo "${id}" (${nombre}) no aparece en el código: quítalo y usa solo elementos presentes en el código.`,
    ),
    ...miembrosSinRespaldo(diagrama, archivos).map(
      ({ nodo, tipo, nombre }) =>
        `El ${tipo === 'metodo' ? 'método' : 'atributo'} "${nombre}" de "${nodo}" no aparece en el código: quítalo.`,
    ),
  ];
}

// En el último intento no se falla por fidelidad: se corrige. El título pasa a ser neutro, los
// atributos y métodos sin respaldo se quitan y los nodos sin respaldo se marcan (not_in_code),
// porque la verificación es una heurística y borrar un nodo real sería peor que marcarlo.
function corregirFidelidad(diagrama, archivos) {
  if (revisarTitulo(diagrama)) {
    diagrama.titulo = TITULO_NEUTRO[diagrama.tipo];
    if (PROMETE_MIEMBROS.test(diagrama.descripcion)) diagrama.descripcion = '';
  }
  const miembros = miembrosSinRespaldo(diagrama, archivos);
  const sobra = (nodo, tipo, nombre) =>
    miembros.some((m) => m.nodo === nodo && m.tipo === tipo && m.nombre === nombre);
  for (const nodo of diagrama.nodos) {
    nodo.atributos = nodo.atributos.filter((a) => !sobra(nodo.id, 'atributo', a.nombre));
    nodo.metodos = nodo.metodos.filter((m) => !sobra(nodo.id, 'metodo', m.nombre));
  }
  const inventados = new Set(nodosSinRespaldo(diagrama, archivos).map((n) => n.id));
  const proto = jsonAProto(diagrama);
  for (const nodo of proto.nodes) nodo.notInCode = inventados.has(nodo.id);
  return proto;
}

// Genera un diagrama validado. Si la primera respuesta no pasa la validación, se reintenta una
// sola vez contándole a Gemini qué estuvo mal. Nunca devuelve un diagrama a medias.
export async function generarDiagrama(
  { archivos, tipo, pregunta, anterior, signal },
  { llamar = llamarGeminiJson, alProgreso = () => {} } = {},
) {
  const usuario = construirPrompt({ archivos, tipo, pregunta, anterior });

  alProgreso(ProgressStage.ANALYZING);
  let resultado = await intentar(usuario, false);
  if (resultado.ok) return resultado.diagrama;

  alProgreso(ProgressStage.RETRYING);
  const correccion =
    `${usuario}\n\nTu respuesta anterior no era válida por estos motivos:\n` +
    resultado.errores.map((error) => `- ${error}`).join('\n') +
    '\nCorrígela y devuelve solo el JSON.';
  resultado = await intentar(correccion, true);
  if (resultado.ok) return resultado.diagrama;

  throw new ConnectError(
    'La IA devolvió un diagrama inválido dos veces. Intenta reformular la pregunta o reducir el código.',
    Code.Internal,
  );

  async function intentar(textoUsuario, esUltimo) {
    const texto = await llamar({ sistema: INSTRUCCIONES_DIAGRAMA, usuario: textoUsuario, signal });
    alProgreso(ProgressStage.VALIDATING);
    let valor;
    try {
      valor = extraerJson(texto);
    } catch {
      return { ok: false, errores: ['La respuesta no era un objeto JSON válido.'] };
    }
    const validacion = validarDiagrama(valor);
    if (!validacion.ok) return validacion;
    const pedido = tipoAJson(tipo);
    if (validacion.diagrama.tipo !== pedido) {
      return {
        ok: false,
        errores: [`Se pidió un diagrama de tipo "${pedido}" y devolviste "${validacion.diagrama.tipo}".`],
      };
    }
    if (!esUltimo) {
      const errores = erroresDeFidelidad(validacion.diagrama, archivos);
      if (errores.length) return { ok: false, errores };
    }
    return { ok: true, diagrama: corregirFidelidad(validacion.diagrama, archivos) };
  }
}
