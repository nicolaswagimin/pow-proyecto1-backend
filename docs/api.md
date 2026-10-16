# API · CodeToDiagram

URL base: `http://localhost:3001/api` en local y `https://pow-proyecto1-backend.onrender.com/api` en producción.

- Todas las peticiones y respuestas son JSON.
- Todos los errores tienen la forma `{ "error": "mensaje en español" }`. Los errores de validación del registro agregan `campo` (`nombre`, `email` o `password`) para que el frontend muestre el mensaje junto al campo.
- Las rutas protegidas exigen la cabecera `Authorization: Bearer <token>`.

## Errores comunes a todas las rutas

| Código | Cuándo | Cuerpo |
|---|---|---|
| `400` | El cuerpo no es un JSON válido | `{ "error": "El cuerpo de la petición no es un JSON válido." }` |
| `401` | Ruta protegida sin token o con el esquema equivocado | `{ "error": "Inicia sesión para continuar." }` |
| `401` | Token inválido, expirado o de un usuario que ya no existe | `{ "error": "Tu sesión expiró o no es válida. Inicia sesión de nuevo." }` |
| `404` | Ruta inexistente bajo `/api` | `{ "error": "Ruta no encontrada." }` |
| `500` | Error no previsto | `{ "error": "Error interno del servidor." }` |

## Estado

### `GET /api/health`

Pública. Dice si el servidor, la base de datos y la IA están disponibles. La usan los health checks de Render y `demo.sh`.

```json
{ "ok": true, "db": true, "ia": true }
```

- `db` es `false` si `SELECT 1` falla o falta `DATABASE_URL`.
- `ia` es `false` si falta `GEMINI_API_KEY` (no consulta a Gemini).
- Siempre responde `200` mientras el servidor esté arriba.

## Autenticación

### `POST /api/auth/registro`

Pública. Crea la cuenta e inicia la sesión.

Request:

```json
{ "nombre": "Ana Pérez", "email": "ana@ejemplo.com", "password": "secreta123" }
```

Response `201`:

```json
{
  "token": "eyJhbGciOiJIUzI1NiIs…",
  "usuario": {
    "id": 7,
    "nombre": "Ana Pérez",
    "email": "ana@ejemplo.com",
    "avatar_url": null,
    "proveedor": "local",
    "creado_en": "2026-10-12T22:41:03.512Z"
  }
}
```

Errores:

| Código | `campo` | Mensaje |
|---|---|---|
| `400` | `nombre` | "Escribe tu nombre." / "El nombre no puede superar los 100 caracteres." |
| `400` | `email` | "Escribe un correo válido, como nombre@dominio.com." (también si supera 255 caracteres) |
| `400` | `password` | "La contraseña necesita al menos 8 caracteres." / "La contraseña no puede superar los 72 caracteres." (72 bytes en UTF-8) |
| `409` | `email` | "Ese correo ya tiene una cuenta. Inicia sesión." |
| `500` | — | "No se pudo crear la cuenta. Revisa la base de datos." |

El nombre y el correo se recortan; el correo se guarda en minúsculas.

### `POST /api/auth/login`

Pública, con límite de 10 intentos cada 15 minutos por IP.

Request:

```json
{ "email": "ana@ejemplo.com", "password": "secreta123" }
```

Response `200`: igual que el registro, `{ token, usuario }`.

Errores:

| Código | Mensaje |
|---|---|
| `400` | "Escribe tu correo y tu contraseña." |
| `401` | "El correo o la contraseña no coinciden." (mismo mensaje si el correo no existe, para no revelar qué cuentas hay) |
| `429` | "Demasiados intentos de inicio de sesión. Espera unos minutos y vuelve a intentarlo." |
| `500` | "No se pudo iniciar sesión. Revisa la base de datos." |

### `GET /api/auth/yo`

Protegida. Devuelve los datos actuales del usuario del token.

Response `200`:

```json
{ "usuario": { "id": 7, "nombre": "Ana Pérez", "email": "ana@ejemplo.com", "avatar_url": null, "proveedor": "local", "creado_en": "…" } }
```

Errores: los `401` comunes y `500` "No se pudo verificar la sesión. Revisa la base de datos."

## Servicio de diagramas (gRPC)

Generar, guardar, listar, abrir y eliminar diagramas **no** va por REST: va por gRPC en el mismo servidor y puerto, en las rutas `/codetodiagram.v1.DiagramService/*`. Las RPC, sus errores y cómo probarlas están en [grpc.md](grpc.md).

| RPC | Tipo | Resumen |
|---|---|---|
| `GenerateDiagram` | Unario | Código → diagrama validado |
| `StreamDiagram` | Server streaming | Progreso, diagrama y diff |
| `SaveDiagram` | Unario | Guarda en el historial |
| `ListDiagrams` | Unario | Historial del usuario |
| `GetDiagram` | Unario | Un diagrama guardado con su código |
| `DeleteDiagram` | Unario | Borra un diagrama propio |

Las rutas REST `/api/items` y `/api/ia` se eliminaron: hoy responden `404`.

## Probar con curl

```bash
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/registro -H "Content-Type: application/json" \
  -d '{"nombre":"Ana","email":"ana@ejemplo.com","password":"secreta123"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')

curl http://localhost:3001/api/auth/yo -H "Authorization: Bearer $TOKEN"
```

Para el servicio de diagramas, ver los ejemplos con `buf curl` en [grpc.md](grpc.md#probar-con-buf-curl).
