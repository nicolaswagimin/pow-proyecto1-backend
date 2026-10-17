# CodeToDiagram · Backend

API de **CodeToDiagram**, un visualizador reactivo de arquitectura: la persona pega código y la app dibuja el diagrama de sus módulos, clases, servicios y dependencias, que se actualiza solo al editar.

Proyecto 1 de la materia Programación orientada a la web. Node.js + Express 5, gRPC con Connect, PostgreSQL (Neon) y Google Gemini por su API REST.

Frontend: <https://github.com/nicolaswagimin/pow-proyecto1-frontend>

## Qué hace

- **REST** (Express): registro, login con JWT y `/api/health`.
- **gRPC** (Connect), en el mismo servidor y puerto: el servicio de diagramas. Gemini lee el código y devuelve nodos y conexiones en JSON; el backend lo valida (falla cerrado), calcula el diff contra la versión anterior y guarda el historial de cada usuario.
- Acepta **gRPC puro** (HTTP/2), **gRPC-Web** (lo que usa el navegador) y **Connect** sin proxy Envoy.

## Requisitos

- Node.js 20 o superior
- Una base de datos PostgreSQL (Neon, plan gratuito)
- Una API key de Gemini: <https://aistudio.google.com/apikey>

## Correr en local

```bash
npm install
cp .env.example .env     # rellena DATABASE_URL, GEMINI_API_KEY y JWT_SECRET
npm run dev              # http://localhost:3001, se reinicia al guardar
curl http://localhost:3001/api/health
# {"ok":true,"db":true,"ia":true}
```

Pruebas y contrato gRPC:

```bash
npm test             # node:test, con Gemini y base de datos simulados
npm run proto:lint   # reglas de Buf sobre proto/
npm run proto:gen    # regenera src/gen/ tras cambiar el .proto
```

Si `db` o `ia` salen en `false`, revisa `DATABASE_URL` / `DB_SSL` o `GEMINI_API_KEY`. Aunque falle la base de datos, el servidor arranca igual y muestra el error en la consola. Las tablas se crean solas a partir de `schema.sql`.

## Endpoints REST

| Método | Ruta | Acceso | Qué hace |
|---|---|---|---|
| `GET` | `/api/health` | Pública | Estado del servidor, la base y la IA |
| `POST` | `/api/auth/registro` | Pública | Crea la cuenta y devuelve `{ token, usuario }` |
| `POST` | `/api/auth/login` | Pública, 10 intentos / 15 min por IP | Devuelve `{ token, usuario }` |
| `GET` | `/api/auth/yo` | Token | Datos del usuario |

El detalle de cada request, response y error está en [docs/api.md](docs/api.md).

## Servicio gRPC `codetodiagram.v1.DiagramService`

Todas las RPC exigen el JWT en el metadato `authorization: Bearer <token>`.

| RPC | Tipo | Qué hace |
|---|---|---|
| `GenerateDiagram` | Unario | Código + tipo (arquitectura, secuencia o clases) + pregunta → diagrama validado y verificado contra el código (60 / 15 min por usuario) |
| `StreamDiagram` | Server streaming | Igual, enviando el progreso y, al editar, el diff |
| `SaveDiagram` | Unario | Guarda en el historial |
| `ListDiagrams` | Unario | Historial del usuario |
| `GetDiagram` | Unario | Un diagrama guardado con su código |
| `DeleteDiagram` | Unario | Borra un diagrama propio |

Probarlo en local con gRPC puro:

```bash
npx buf curl --protocol grpc --http2-prior-knowledge --schema proto \
  -H "authorization: Bearer $TOKEN" \
  http://localhost:3001/codetodiagram.v1.DiagramService/ListDiagrams -d '{}'
```

En producción también funciona gRPC puro, por HTTPS:

```bash
npx buf curl --protocol grpc --schema proto -H "authorization: Bearer $TOKEN" \
  https://pow-proyecto1-backend.onrender.com/codetodiagram.v1.DiagramService/ListDiagrams -d '{}'
```

Más ejemplos y el detalle de errores en [docs/grpc.md](docs/grpc.md).

## Documentación

| Documento | Contenido |
|---|---|
| [docs/grpc.md](docs/grpc.md) | Por qué gRPC, el contrato, cómo regenerar y probar |
| [docs/ia.md](docs/ia.md) | Prompt de Gemini, formato JSON y validación |
| [docs/api.md](docs/api.md) | Endpoints REST y resumen de las RPC |
| [docs/base-de-datos.md](docs/base-de-datos.md) | Tablas, columnas, relaciones y consultas |
| [docs/seguridad.md](docs/seguridad.md) | bcrypt, JWT (REST y gRPC), CORS, límites y variables de entorno |
| [docs/despliegue.md](docs/despliegue.md) | Neon, Render, variables y comprobaciones |
| [docs/arquitectura-backend.md](docs/arquitectura-backend.md) | Carpetas, servidor de un puerto, interceptores y flujo de una petición |
| [docs/decisiones/](docs/decisiones) | Decisiones de arquitectura (ADR) |
| [CHANGELOG.md](CHANGELOG.md) | Cambios |

## Variables de entorno

| Variable | Descripción | Por defecto |
|---|---|---|
| `PORT` | Puerto del servidor | `3001` |
| `DATABASE_URL` | Cadena de conexión de PostgreSQL | — |
| `DB_SSL` | `false` para un PostgreSQL local sin SSL | SSL activado |
| `GEMINI_API_KEY` | API key de Gemini (solo vive en el backend) | — |
| `GEMINI_MODEL` | Modelo de Gemini | `gemini-2.5-flash` |
| `FRONTEND_URL` | Orígenes permitidos por CORS, separados por comas | `http://localhost:4200` |
| `JWT_SECRET` | Secreto de las sesiones. **Obligatorio** | — |
| `JWT_EXPIRES_IN` | Duración de la sesión | `7d` |

## Próximos pasos

- Más tipos de diagrama (flujo de trabajo, flujo de datos, ciclo de vida; Clases ya está): un valor en el enum `DiagramType`, sus reglas en el prompt y su dibujo en el frontend.
- Cubrir los pendientes de [docs/seguridad.md](docs/seguridad.md): límite en el registro, cabeceras de seguridad y revocación de tokens.
