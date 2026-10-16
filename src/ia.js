// Integración con Google Gemini mediante su API REST (sin SDK).
// La API key solo se lee de GEMINI_API_KEY y nunca se envía al frontend.

import { Code, ConnectError } from '@connectrpc/connect';

const MODELO_POR_DEFECTO = 'gemini-2.5-flash';

export function iaDisponible() {
  return Boolean(process.env.GEMINI_API_KEY);
}

// Pide a Gemini una respuesta en modo JSON y devuelve el texto tal cual (se valida después).
// Los errores salen ya como errores gRPC para que el servicio los reenvíe al cliente.
// Si Gemini no responde en este tiempo, se corta: el usuario no queda esperando para siempre.
const TIEMPO_MAXIMO_MS = 60_000;

export async function llamarGeminiJson({
  sistema,
  usuario,
  signal,
  fetchImpl = fetch,
  tiempoMaximoMs = TIEMPO_MAXIMO_MS,
}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ConnectError('La IA no está configurada en el servidor.', Code.FailedPrecondition);
  }

  const modelo = process.env.GEMINI_MODEL || MODELO_POR_DEFECTO;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`;

  const limite = AbortSignal.timeout(tiempoMaximoMs);
  let respuesta;
  try {
    respuesta = await fetchImpl(url, {
      method: 'POST',
      signal: signal ? AbortSignal.any([signal, limite]) : limite,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: sistema }] },
        contents: [{ role: 'user', parts: [{ text: usuario }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
      }),
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    if (limite.aborted) {
      throw new ConnectError('La IA tardó demasiado en responder. Inténtalo de nuevo.', Code.Unavailable);
    }
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
