import { Code, ConnectError } from '@connectrpc/connect';
import { ProgressStage } from '../gen/codetodiagram/v1/diagram_pb.js';
import { llamarGeminiJson } from '../ia.js';
import { jsonAProto, tipoAJson } from './convertir.js';
import { INSTRUCCIONES_DIAGRAMA, construirPrompt } from './prompt.js';
import { validarDiagrama } from './validar.js';

// Gemini puede envolver el JSON en un bloque ```json o añadir una frase: se toma el objeto.
export function extraerJson(texto) {
  const inicio = texto.indexOf('{');
  const fin = texto.lastIndexOf('}');
  if (inicio === -1 || fin <= inicio) throw new Error('La IA no devolvió JSON.');
  return JSON.parse(texto.slice(inicio, fin + 1));
}

// Genera un diagrama validado. Si la primera respuesta no pasa la validación, se reintenta una
// sola vez contándole a Gemini qué estuvo mal. Nunca devuelve un diagrama a medias.
export async function generarDiagrama(
  { archivos, tipo, pregunta, anterior, signal },
  { llamar = llamarGeminiJson, alProgreso = () => {} } = {},
) {
  const usuario = construirPrompt({ archivos, tipo, pregunta, anterior });

  alProgreso(ProgressStage.ANALYZING);
  let resultado = await intentar(usuario);
  if (resultado.ok) return resultado.diagrama;

  alProgreso(ProgressStage.RETRYING);
  const correccion =
    `${usuario}\n\nTu respuesta anterior no era válida por estos motivos:\n` +
    resultado.errores.map((error) => `- ${error}`).join('\n') +
    '\nCorrígela y devuelve solo el JSON.';
  resultado = await intentar(correccion);
  if (resultado.ok) return resultado.diagrama;

  throw new ConnectError(
    'La IA devolvió un diagrama inválido dos veces. Intenta reformular la pregunta o reducir el código.',
    Code.Internal,
  );

  async function intentar(textoUsuario) {
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
    return { ok: true, diagrama: jsonAProto(validacion.diagrama) };
  }
}
