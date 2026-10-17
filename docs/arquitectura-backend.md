# Arquitectura del backend · CodeToDiagram

Node.js 20+ con Express 5 y módulos ES, PostgreSQL con `pg`, Gemini por su API REST (sin SDK) y gRPC con Connect. Un solo proceso y un solo puerto sirven REST (Express) y el servicio de diagramas (gRPC, gRPC-Web y Connect).

## Carpetas

```
schema.sql                 tablas usuarios y diagramas (idempotente, se ejecuta al arrancar)
proto/codetodiagram/v1/    contrato gRPC (diagram.proto), fuente única de los tipos
buf.yaml, buf.gen.yaml     lint y generación de código con Buf
.env.example               variables de entorno sin valores
src/
  index.js                 arranque: JWT_SECRET, Express, Connect, CORS y servidor
  servidor.js              un puerto para HTTP/1.1 y HTTP/2 (detecta el prefacio de HTTP/2)
  limitador.js             límite por ventana deslizante en memoria (para gRPC)
  db.js                    pool de PostgreSQL, iniciarDB() y dbDisponible()
  ia.js                    llamarGeminiJson(): Gemini en modo JSON
  gen/                     código generado del .proto (no se edita a mano)
  grpc/
    rutas.js               registra DiagramService en el router de Connect
    servicio.js            implementación de las 6 RPC
    interceptores.js       interceptorAuth (JWT) e interceptorLimite (60 / 15 min)
    contexto.js            clave de contexto USUARIO
  diagramas/
    prompt.js              instrucciones y prompt para Gemini
    generar.js             llama, valida, verifica fidelidad y reintenta una vez
    verificar.js           ¿cada nodo, atributo y método aparece en el código?
    esquema.js, validar.js validación del JSON de Gemini (Zod + reglas propias)
    convertir.js           JSON de Gemini ↔ mensajes del proto
    diff.js                diff entre dos versiones de un diagrama
    entrada.js             límites de lo que manda el usuario
    repositorio.js         consultas a la tabla diagramas
  middleware/
    auth.js                requireAuth, verificarToken, firmarToken y COLUMNAS_PUBLICAS
    limites.js             limiteLogin (por IP)
  routes/
    auth.js                /registro, /login y /yo
test/                      pruebas con node:test (Gemini y base de datos simulados)
  fixtures/                código real usado en las pruebas (el simulador donde la IA inventó una base de datos)
```

## Cómo se reparte una petición

```
conexión TCP ──► servidor.js ──┬─ prefacio HTTP/2 ──► http2.Server ─┐
                               └─ cualquier otro ───► http.Server ──┤
                                                                    ▼
                                             ¿ruta /codetodiagram.v1.*?
                                       sí ──► CORS gRPC ──► connectNodeAdapter
                                       no ──► Express (fallback de Connect)
```

## Middleware de Express (REST), en orden

| # | Middleware | Alcance | Qué hace |
|---|---|---|---|
| 1 | `trust proxy` (1) | Todo | `req.ip` es la IP real detrás del proxy de Render |
| 2 | `cors` | Todo | Solo los orígenes de `FRONTEND_URL`; sin `Origin` se permite |
| 3 | `express.json()` | Todo | Lee el cuerpo JSON (hasta 100 kB) |
| 4 | `limiteLogin` | `POST /api/auth/login` | 10 intentos cada 15 min por IP |
| 5 | `requireAuth` | `/api/auth/yo` | Verifica el JWT y carga `req.usuario` desde la base |
| 6 | 404 de `/api` | Rutas no encontradas | `{ "error": "Ruta no encontrada." }` |
| 7 | Manejador de errores | Todo | JSON mal formado → `400`; cualquier otro → `500` sin detalles |

## Interceptores de gRPC, en orden

| # | Interceptor | Alcance | Qué hace |
|---|---|---|---|
| 1 | `interceptorAuth` | Todas las RPC | Valida `authorization: Bearer <token>` con `verificarToken` y deja el usuario en el contexto |
| 2 | `interceptorLimite` | `GenerateDiagram`, `StreamDiagram` | 60 cada 15 min por usuario → `resource_exhausted` |

## Flujo de una petición gRPC: `StreamDiagram`

```
Navegador (gRPC-Web) ──► servidor.js ──► CORS ──► interceptorAuth ──► interceptorLimite ──► servicio.streamDiagram
                                                       │                     │                      │
                                                 unauthenticated     resource_exhausted     validarEntrada
                                                                                                     │ invalid_argument
                                                                                                     ▼
                                       progreso ◄── generarDiagrama ──► Gemini ──► validarDiagrama ──┐
                                                         ▲                                           │ inválido
                                                         └────────── 1 reintento con errores ◄───────┘
                                                                                                     │ válido
                                         eventos: progress…, diagram, diff (si había previous), progress(DONE)
```

1. `servidor.js` recibe la conexión HTTP/1.1 y la pasa al adaptador de Connect, que reconoce gRPC-Web.
2. `interceptorAuth` valida el token (misma lógica que REST) y `interceptorLimite` cuenta la llamada.
3. `validarEntrada` revisa archivos, tamaño, tipo y pregunta.
4. `generarDiagrama` llama a Gemini; cada etapa (`ANALYZING`, `VALIDATING`, `RETRYING`) sale al cliente como evento `progress` en cuanto ocurre.
5. Con el diagrama validado se envía `diagram`; si la petición traía `previous`, también el `diff` calculado en el servidor. Termina con `progress` `DONE`.
6. Si el usuario sigue escribiendo, el cliente cancela y la señal corta también el `fetch` a Gemini.

## Flujo de un login

1. `limiteLogin` cuenta el intento por IP; al pasar de 10 en 15 min responde `429`.
2. Se normaliza el correo (recorte y minúsculas) y se busca el usuario.
3. `bcrypt.compare` contra su hash, o contra `HASH_FALSO` si no existe (tiempo parejo).
4. Si coincide, responde `200 { token, usuario }` sin `password_hash`; si no, `401` con el mensaje genérico.

## Arranque

1. `dotenv` carga el `.env`.
2. Sin `JWT_SECRET`, el proceso termina con un mensaje claro.
3. El servidor empieza a escuchar **antes** de conectar la base de datos: si Neon falla, sigue arriba, `/api/health` responde `db: false` y el error queda en el log.
4. `iniciarDB()` ejecuta `schema.sql`.

## Pruebas

`npm test` ejecuta `node --test` sobre `test/`: validador, conversión, diff, generación con reintento, servidor de un puerto, limitador, interceptores y servicio. Gemini y la base de datos se reemplazan por dobles, así que las pruebas no gastan cuota ni tocan Neon.
