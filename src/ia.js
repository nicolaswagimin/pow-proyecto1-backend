// Integración con Google Gemini mediante su API REST (sin SDK).
// La API key solo se lee de GEMINI_API_KEY y nunca se envía al frontend.

import { Code, ConnectError } from '@connectrpc/connect';

// Edita este texto para adaptar el comportamiento de la IA al tema del proyecto.
export const INSTRUCCIONES = `
Eres un asistente útil para una aplicación web universitaria.
Responde siempre en español, de forma clara, breve y amable.
Si no sabes algo, dilo con honestidad en lugar de inventar.
`.trim();

const MODELO_POR_DEFECTO = 'gemini-2.5-flash';

export function iaDisponible() {
  return Boolean(process.env.GEMINI_API_KEY);
}

export async function preguntarIA(pregunta) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('La IA no está configurada: falta GEMINI_API_KEY en el archivo .env');
  }

  const modelo = process.env.GEMINI_MODEL || MODELO_POR_DEFECTO;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;

  const respuesta = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCCIONES }] },
      contents: [{ role: 'user', parts: [{ text: pregunta }] }],
    }),
  });

  const datos = await respuesta.json().catch(() => ({}));

  if (!respuesta.ok) {
    const detalle = datos?.error?.message || `código ${respuesta.status}`;
    throw new Error(`Error al consultar Gemini: ${detalle}`);
  }

  const texto = datos?.candidates?.[0]?.content?.parts
    ?.map((parte) => parte.text ?? '')
    .join('')
    .trim();

  if (!texto) {
    throw new Error('La IA no devolvió ninguna respuesta. Intenta reformular la pregunta.');
  }
  return texto;
}

// Pide a Gemini una respuesta en modo JSON y devuelve el texto tal cual (se valida después).
// Los errores salen ya como errores gRPC para que el servicio los reenvíe al cliente.
export async function llamarGeminiJson({ sistema, usuario, signal, fetchImpl = fetch }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ConnectError('La IA no está configurada en el servidor.', Code.FailedPrecondition);
  }

  const modelo = process.env.GEMINI_MODEL || MODELO_POR_DEFECTO;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;

  let respuesta;
  try {
    respuesta = await fetchImpl(url, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: 'user', parts: [{ text: usuario }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ConnectError(`No se pudo consultar a la IA: ${err.message}`, Code.Unavailable);
  }

  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) {
    const detalle = datos?.error?.message || `código ${respuesta.status}`;
    throw new ConnectError(`No se pudo consultar a la IA: ${detalle}`, Code.Unavailable);
  }

  const texto = datos?.candidates?.[0]?.content?.parts
    ?.map((parte) => parte.text ?? '')
    .join('')
    .trim();
  if (!texto) throw new ConnectError('La IA no devolvió ninguna respuesta.', Code.Unavailable);
  return texto;
}
