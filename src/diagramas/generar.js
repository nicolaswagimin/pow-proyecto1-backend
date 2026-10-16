// Gemini puede envolver el JSON en un bloque ```json o añadir una frase: se toma el objeto.
export function extraerJson(texto) {
  const inicio = texto.indexOf('{');
  const fin = texto.lastIndexOf('}');
  if (inicio === -1 || fin <= inicio) throw new Error('La IA no devolvió JSON.');
  return JSON.parse(texto.slice(inicio, fin + 1));
}
