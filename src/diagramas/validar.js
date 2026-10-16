import { esquemaDiagrama } from './esquema.js';

// Valida el JSON de Gemini antes de dibujarlo. Falla cerrado: si hay un solo error, el diagrama
// no se usa. Devuelve todos los errores juntos para poder pasárselos a Gemini en el reintento.

export const MAX_NODOS = 12;
export const TIPOS = ['arquitectura', 'secuencia'];
export const CATEGORIAS = ['persona', 'componente', 'contenedor', 'base-datos', 'externo'];

export function validarDiagrama(valor) {
  if (valor === null || typeof valor !== 'object' || Array.isArray(valor)) {
    return { ok: false, errores: ['La respuesta no es un objeto JSON.'] };
  }

  const forma = esquemaDiagrama.safeParse(valor);
  if (!forma.success) {
    return { ok: false, errores: forma.error.issues.map(describirProblema) };
  }

  const diagrama = forma.data;
  const errores = [...revisarTipoYCategorias(diagrama), ...revisarCantidad(diagrama)];
  return errores.length ? { ok: false, errores } : { ok: true, diagrama };
}

function describirProblema(problema) {
  const ruta = problema.path.join('.');
  // Los mensajes propios del esquema ya están en español; los de Zod se acompañan de la ruta.
  return /[áéíóúñ]|necesita/.test(problema.message)
    ? problema.message
    : `El campo "${ruta}" no tiene un valor válido.`;
}

function revisarTipoYCategorias(diagrama) {
  const errores = [];
  if (!TIPOS.includes(diagrama.tipo)) {
    errores.push(`Tipo de diagrama desconocido: "${diagrama.tipo}".`);
  }
  for (const nodo of diagrama.nodos) {
    if (!CATEGORIAS.includes(nodo.categoria)) {
      errores.push(`El nodo "${nodo.id}" tiene una categoría desconocida: "${nodo.categoria}".`);
    }
  }
  return errores;
}

function revisarCantidad(diagrama) {
  if (diagrama.nodos.length === 0) return ['El diagrama debe tener al menos un nodo.'];
  if (diagrama.nodos.length > MAX_NODOS) {
    return [`El diagrama debe tener como máximo ${MAX_NODOS} nodos (tiene ${diagrama.nodos.length}).`];
  }
  return [];
}
