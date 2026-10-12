# CodeToDiagram · Backend

API de **CodeToDiagram**, un visualizador reactivo de arquitectura: la persona pega código y la app dibuja el diagrama de sus módulos, clases, servicios y dependencias, que se actualiza solo al editar.

Proyecto 1 de la materia Programación orientada a la web. Node.js + Express 5, PostgreSQL (Neon) y Google Gemini por su API REST.

Frontend: <https://github.com/nicolaswagimin/pow-proyecto1-frontend>

## Estado actual

Funcionan el registro y el login con JWT, un CRUD de ejemplo (`items`) filtrado por usuario y una ruta de preguntas a Gemini. La función propia de CodeToDiagram todavía no está en la API: Gemini analizará el código y devolverá nodos y conexiones en JSON para que el frontend los dibuje. Ese es el siguiente paso (ver "Próximos pasos").

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

Si `db` o `ia` salen en `false`, revisa `DATABASE_URL` / `DB_SSL` o `GEMINI_API_KEY`. Aunque falle la base de datos, el servidor arranca igual y muestra el error en la consola. Las tablas se crean solas a partir de `schema.sql`.

## Endpoints

| Método | Ruta | Acceso | Qué hace |
|---|---|---|---|
| `GET` | `/api/health` | Pública | Estado del servidor, la base y la IA |
| `POST` | `/api/auth/registro` | Pública | Crea la cuenta y devuelve `{ token, usuario }` |
| `POST` | `/api/auth/login` | Pública, 10 intentos / 15 min por IP | Devuelve `{ token, usuario }` |
| `GET` | `/api/auth/yo` | Token | Datos del usuario |
| `GET` | `/api/items` | Token | Items del usuario |
| `POST` | `/api/items` | Token | Crea un item |
| `DELETE` | `/api/items/:id` | Token | Borra un item propio |
| `POST` | `/api/ia` | Token, 30 / 15 min por usuario | Pregunta a Gemini |

El detalle de cada request, response y error está en [docs/api.md](docs/api.md).

## Documentación

| Documento | Contenido |
|---|---|
| [docs/api.md](docs/api.md) | Cada endpoint con request, response y errores |
| [docs/base-de-datos.md](docs/base-de-datos.md) | Tablas, columnas, relaciones y consultas |
| [docs/seguridad.md](docs/seguridad.md) | bcrypt, JWT, CORS, límites de intentos y variables de entorno |
| [docs/despliegue.md](docs/despliegue.md) | Neon, Render, variables y comprobaciones |
| [docs/arquitectura-backend.md](docs/arquitectura-backend.md) | Carpetas, middleware y flujo de una petición |
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

- Reemplazar `items` por `diagramas`, para guardar cada diagrama con su código fuente y el JSON de nodos y aristas, para el historial.
- Cambiar `INSTRUCCIONES` en `src/ia.js` para que responda solo con el JSON de nodos y aristas a partir del código recibido.
- Cubrir los pendientes de [docs/seguridad.md](docs/seguridad.md): límite en el registro, cabeceras de seguridad y revocación de tokens.
