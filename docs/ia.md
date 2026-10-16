# IA · CodeToDiagram

Gemini **solo entiende el código** y devuelve un JSON con nodos y conexiones. No dibuja nada: el layout y el dibujo los hace el frontend de forma determinista. Esta separación viene de Archify.

## Flujo

```
archivos + tipo + pregunta (+ diagrama anterior)
        │
        ▼
construirPrompt()  ──►  Gemini (modo JSON)  ──►  extraerJson()  ──►  validarDiagrama()
                                                                        │
                                       ┌──────── inválido ──────────────┤
                                       ▼                                ▼ válido
                    1 reintento con la lista de errores           jsonAProto() → Diagram
                                       │
                               inválido otra vez → error `internal`
```

Código: `src/diagramas/` (`prompt.js`, `generar.js`, `validar.js`, `esquema.js`, `convertir.js`) y `src/ia.js` (`llamarGeminiJson`).

## La llamada a Gemini

- Modelo: `GEMINI_MODEL` o, si falta, `gemini-2.5-flash`. API REST con `fetch`, sin SDK.
- `generationConfig`: `responseMimeType: "application/json"` y `temperature: 0.2` (respuestas estables entre ediciones).
- La API key solo vive en el backend (`GEMINI_API_KEY`). Si falta, el servicio responde `failed_precondition`.
- Si el usuario sigue escribiendo y el frontend cancela la llamada, la señal de cancelación llega hasta el `fetch` a Gemini.
- Si Gemini no responde en 60 s, la llamada se corta y el servicio responde `unavailable` con "La IA tardó demasiado en responder. Inténtalo de nuevo."
- Si todos los archivos están vacíos, no se llama a Gemini (`invalid_argument`).
- El modelo por defecto, `gemini-2.5-flash`, puede responder "high demand" en horas de mucho uso. Se cambia con `GEMINI_MODEL` (por ejemplo `gemini-3.5-flash-lite`) sin tocar el código.

## El prompt

Las instrucciones del sistema están en `INSTRUCCIONES_DIAGRAMA` (`src/diagramas/prompt.js`). Piden:

- Responder **solo** con un objeto JSON con la forma de abajo.
- Entre 1 y 12 nodos; si hay más piezas, agrupar o dejar fuera lo que no ayuda a responder la pregunta.
- Ids con minúsculas, números y guiones, sin repetir; cada conexión une dos nodos distintos que existen.
- `orden` obligatorio en secuencia.
- No inventar piezas que no estén en el código. Textos en español.

El mensaje del usuario (`construirPrompt`) lleva, en este orden: el tipo, la pregunta (o "muestra la estructura principal"), el **diagrama anterior** si lo hay, y cada archivo como `--- archivo: nombre ---`.

### Diagrama anterior y diff

Cuando el usuario edita el código, el frontend manda el diagrama que ya está dibujado (`previous`). El prompt le pide a Gemini que **reutilice sus ids** para todo lo que no cambió. Sin esto, la IA podría renombrar `api` a `servidor-api` y el diff mostraría un nodo eliminado y otro agregado aunque nada cambió.

## Formato JSON esperado

```json
{
  "tipo": "arquitectura",
  "titulo": "Login",
  "descripcion": "Cómo inicia sesión un usuario.",
  "nodos": [
    { "id": "web", "nombre": "Frontend", "categoria": "contenedor", "tecnologia": "Angular", "descripcion": "…", "archivo": "auth.service.ts" },
    { "id": "api", "nombre": "API REST", "categoria": "contenedor", "tecnologia": "Express", "descripcion": "…", "archivo": "routes/auth.js" }
  ],
  "conexiones": [
    { "id": "c1", "de": "web", "a": "api", "etiqueta": "POST /login" }
  ]
}
```

- `tipo`: `arquitectura` o `secuencia`.
- `categoria`: `persona`, `componente`, `contenedor`, `base-datos` o `externo` (las formas C4 que dibuja el frontend).
- `orden`: obligatorio (1, 2, 3…) en secuencia; se omite en arquitectura.

## Validación: falla cerrado

`validarDiagrama` (`src/diagramas/validar.js`) usa Zod para la forma y reglas propias para lo que cruza datos. Devuelve **todos** los errores juntos, en español:

| Regla | Mensaje |
|---|---|
| No es un objeto | `La respuesta no es un objeto JSON.` |
| Tipo desconocido | `Tipo de diagrama desconocido: "flujo".` |
| Categoría desconocida | `El nodo "api" tiene una categoría desconocida: "servicio".` |
| Sin nodos / más de 12 | `El diagrama debe tener al menos un nodo.` / `…como máximo 12 nodos (tiene 13).` |
| Id con formato inválido | `El id "Web" solo puede tener minúsculas, números y guiones.` |
| Id repetido | `El id "api" está repetido.` |
| Conexión a un nodo inventado | `La conexión "c3" apunta a un nodo que no existe: "db"` |
| Autoconexión | `La conexión "c3" une el nodo "api" consigo mismo.` |
| Secuencia sin orden | `En un diagrama de secuencia, la conexión "c2" necesita un orden (1 o más).` |

Además, `generarDiagrama` rechaza un diagrama de un tipo distinto al pedido.

Si la primera respuesta no pasa, se reintenta **una sola vez** agregando al prompt la lista de errores. Si la segunda tampoco pasa, el servicio responde `internal` con `La IA devolvió un diagrama inválido dos veces. Intenta reformular la pregunta o reducir el código.` Nunca se devuelve un diagrama a medias.

El frontend vuelve a validar con las mismas reglas antes de dibujar (`frontend/src/app/diagrama/validar.ts`).

## Límites

- Entrada: hasta 10 archivos y 60 000 caracteres en total; pregunta de hasta 300 caracteres.
- 60 generaciones cada 15 minutos por usuario (interceptor gRPC). El reintento interno no cuenta.

## Pruebas

`test/generar.test.js` y `test/validar.test.js` usan un Gemini simulado: las pruebas nunca consumen la cuota real.
