import { protoAJson, tipoAJson } from './convertir.js';

// Texto que recibe Gemini. Se documenta en docs/ia.md: si lo cambias, actualiza ese archivo.

export const INSTRUCCIONES_DIAGRAMA = `
Eres un analista de arquitectura de software. Lees código y respondes SOLO con un objeto JSON,
sin texto antes ni después, con esta forma exacta:

{
  "tipo": "arquitectura" | "secuencia",
  "titulo": "texto corto",
  "descripcion": "1 o 2 frases: qué pregunta responde el diagrama",
  "nodos": [
    { "id": "minusculas-con-guiones", "nombre": "texto corto",
      "categoria": "persona" | "componente" | "contenedor" | "base-datos" | "externo",
      "tecnologia": "texto corto o vacío", "descripcion": "una frase", "archivo": "archivo de origen o vacío" }
  ],
  "conexiones": [
    { "id": "c1", "de": "id de un nodo", "a": "id de otro nodo", "etiqueta": "verbo o llamada", "orden": 1 }
  ]
}

Reglas:
- Entre 1 y 12 nodos. Si hay más piezas, agrupa o deja fuera lo que no ayuda a responder la pregunta.
- Los ids solo usan minúsculas, números y guiones, y no se repiten.
- Cada conexión une dos nodos distintos que existen en "nodos".
- "orden" es obligatorio (1, 2, 3…) en secuencia; omítelo en arquitectura.
- persona = alguien que usa el sistema; contenedor = aplicación o servicio desplegable;
  componente = módulo dentro de un contenedor; base-datos = almacenamiento; externo = sistema de terceros.
- No inventes piezas que no estén en el código.
- Escribe los textos en español.
`.trim();

export function construirPrompt({ archivos, tipo, pregunta, anterior }) {
  const partes = [`Tipo de diagrama: ${tipoAJson(tipo)}.`];
  partes.push(
    pregunta?.trim()
      ? `Pregunta que debe responder el diagrama: ${pregunta.trim()}`
      : 'No hay pregunta: muestra la estructura principal del código.',
  );
  if (anterior) {
    partes.push(
      'Diagrama anterior del mismo código. Reutiliza sus ids para todo lo que no cambió, ' +
        'así el usuario ve solo los cambios reales:\n' +
        JSON.stringify(protoAJson(anterior)),
    );
  }
  for (const archivo of archivos) {
    partes.push(`--- archivo: ${archivo.name} ---\n${archivo.content}`);
  }
  return partes.join('\n\n');
}
