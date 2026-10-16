# CodeToDiagram: diagramas con IA, diff reactivo y gRPC — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** El usuario pega código, obtiene un diagrama de arquitectura o secuencia validado, lo ve
cambiar (con diff) mientras edita, y lo guarda/abre/exporta; el servicio de diagramas va por gRPC.

**Architecture:** Gemini devuelve JSON (en español) que el backend valida con Zod, convierte a
mensajes del `.proto` y sirve con Connect (gRPC, gRPC-Web y Connect en un solo puerto que detecta
HTTP/1.1 o HTTP/2). Angular recibe por gRPC-Web, vuelve a validar, calcula el diff y dibuja con
layouts deterministas sobre el `ui-diagrama` existente y un componente de secuencia nuevo.

**Tech Stack:** Backend: Node ≥ 20, Express 5 (JS ESM), `pg`/Neon, Zod, `@connectrpc/connect` +
`@connectrpc/connect-node` (v2), `@bufbuild/protobuf` (v2), `@bufbuild/buf` + `@bufbuild/protoc-gen-es`
(dev), `node:test`. Frontend: Angular 22, TS 6, `@connectrpc/connect-web`, Vitest vía
`@angular/build:unit-test`.

**Spec:** `backend/docs/superpowers/specs/2026-10-15-codetodiagram-funcionalidad-grpc-design.md`
(rutas en este plan son relativas a `Final_Proyect/CodeToDiagram/`).

## Global Constraints

- No tocar estilos, tokens, colores, tipografía, animaciones, login, registro ni `auth-layout`.
  Excepciones autorizadas: reescribir `frontend/src/app/pages/inicio/inicio.{html,css,ts}`; **agregar**
  (nunca editar) reglas en `frontend/src/app/diagrama/diagrama.css`. Cualquier otro cambio de estilo
  existente → preguntar al usuario.
- Pantallas nuevas: solo tokens existentes (`--color-exito`, `--color-error`, `--color-aviso`,
  `--color-lapiz`, `--color-borde`, `--color-texto-suave`, `--font-codigo`, …) y componentes `ui/*`.
- Login, registro y `/api/health` siguen en REST sin cambios de comportamiento.
- Máximo 12 nodos por diagrama; ids `^[a-z0-9-]+$`; hasta 10 archivos y 60 000 caracteres en total;
  pregunta ≤ 300 caracteres.
- Límite IA: 60 peticiones (Generate/Stream) cada 15 min por usuario; el reintento interno no cuenta.
- Regeneración automática: debounce 2000 ms, mínimo 5000 ms entre regeneraciones automáticas, solo
  si cambió el contenido (archivos + tipo + pregunta).
- Commits: Conventional Commits en español con alcance (`feat(grpc): …`), **uno por cambio mínimo**
  (cada dependencia, archivo de config, mensaje del proto, función, componente, estilo, test,
  documento). Los "Commit" de cada tarea son el mínimo: dividir más cuando se pueda; `git add -p`
  para separar cambios de naturaleza distinta en un mismo archivo. Cada commit compila y funciona.
  Terminar cada mensaje con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Nunca commitear `.env`, `node_modules`, `dist`, `.angular`. El código generado por Buf **sí** se
  commitea.
- **Nada de `git push`** sin aprobación explícita del usuario. Ninguna variable de entorno nueva
  sin avisar al usuario antes del push.
- Textos de interfaz y errores en español. Identificadores del código en español (como el código
  existente); nombres del `.proto` en inglés (convención protobuf y nombres de la spec).
- Documentación en español, cada archivo en su propio commit `docs:`.

## Review Focus

1. **Gemini envuelve el JSON en ```json … ``` o añade texto** → se extrae el objeto y se valida; si
   no hay JSON, error claro (test en Task 5: `extraerJson`).
2. **Una respuesta vieja llega después de una más nueva** (el usuario siguió editando) → nunca
   reemplaza al diagrama más reciente (test en Task 19: `descarta respuestas obsoletas`).
3. **Backend apagado o Render despertando** → alerta "el servidor está despertando, reintentando…",
   sin spinner infinito; tras 3 intentos, error con botón Reintentar (tests en Task 16 y Task 19).
4. **Ciclos (A→B→A), nodos aislados o un solo nodo** → el layout termina y es determinista
   (test en Task 14: `layout con ciclo`, `nodo aislado`).
5. **Abrir un diagrama guardado que hoy no pasa la validación** → error claro, no se dibuja nada
   (test en Task 19: `cargarGuardado inválido`).

---

## Contrato `.proto` (referencia para todas las tareas)

`backend/proto/codetodiagram/v1/diagram.proto`, `package codetodiagram.v1;`, importa
`google/protobuf/timestamp.proto`.

| Mensaje / enum | Campos (número) |
|---|---|
| `enum DiagramType` | `DIAGRAM_TYPE_UNSPECIFIED=0`, `DIAGRAM_TYPE_ARCHITECTURE=1`, `DIAGRAM_TYPE_SEQUENCE=2` |
| `enum NodeCategory` | `NODE_CATEGORY_UNSPECIFIED=0`, `_PERSON=1`, `_COMPONENT=2`, `_CONTAINER=3`, `_DATABASE=4`, `_EXTERNAL=5` |
| `enum ChangeKind` | `CHANGE_KIND_UNSPECIFIED=0`, `_ADDED=1`, `_REMOVED=2`, `_MODIFIED=3` |
| `enum ProgressStage` | `PROGRESS_STAGE_UNSPECIFIED=0`, `_ANALYZING=1`, `_VALIDATING=2`, `_RETRYING=3`, `_DONE=4` |
| `SourceFile` | `name`(1) string, `content`(2) string |
| `Node` | `id`(1), `name`(2), `category`(3) NodeCategory, `technology`(4), `description`(5), `file`(6) |
| `Edge` | `id`(1), `from`(2), `to`(3), `label`(4), `order`(5) int32 |
| `Diagram` | `type`(1) DiagramType, `title`(2), `description`(3), `nodes`(4) repeated Node, `edges`(5) repeated Edge |
| `Change` | `id`(1) string, `kind`(2) ChangeKind |
| `DiagramDiff` | `nodes`(1) repeated Change, `edges`(2) repeated Change |
| `Progress` | `stage`(1) ProgressStage, `message`(2) string |
| `GenerateDiagramRequest` / `StreamDiagramRequest` | `files`(1) repeated SourceFile, `type`(2), `question`(3), `previous`(4) optional Diagram |
| `GenerateDiagramResponse` | `diagram`(1) |
| `StreamDiagramResponse` | `oneof event { Progress progress=1; Diagram diagram=2; DiagramDiff diff=3; }` |
| `SavedDiagramSummary` | `id`(1) int32, `title`(2), `type`(3), `question`(4), `node_count`(5) int32, `created_at`(6) Timestamp |
| `SavedDiagram` | `id`(1) int32, `title`(2), `question`(3), `files`(4) repeated SourceFile, `diagram`(5), `created_at`(6) Timestamp |
| `SaveDiagramRequest` | `title`(1), `question`(2), `files`(3), `diagram`(4) → `SaveDiagramResponse { SavedDiagramSummary diagram = 1; }` |
| `ListDiagramsRequest` {} | → `ListDiagramsResponse { repeated SavedDiagramSummary diagrams = 1; }` |
| `GetDiagramRequest { int32 id = 1; }` | → `GetDiagramResponse { SavedDiagram diagram = 1; }` |
| `DeleteDiagramRequest { int32 id = 1; }` | → `DeleteDiagramResponse {}` |

`service DiagramService { GenerateDiagram; StreamDiagram (returns stream); SaveDiagram; ListDiagrams; GetDiagram; DeleteDiagram; }`

**JSON de Gemini (español)** ↔ proto: `tipo`↔`type` (`"arquitectura"`/`"secuencia"`), `titulo`,
`descripcion`, `nodos[{id,nombre,categoria,tecnologia,descripcion,archivo}]`,
`conexiones[{id,de,a,etiqueta,orden}]`; `categoria ∈ persona|componente|contenedor|base-datos|externo`.

**Reglas de validación (backend y frontend, idénticas):** tipo especificado; título no vacío;
1–12 nodos; ids de nodo únicos con `^[a-z0-9-]+$`; `nombre` no vacío; categoría válida;
ids de conexión únicos; `de`/`a` existen; `de !== a`; en secuencia, `orden ≥ 1` en todas.
Mensajes de error en español, uno por regla, con el id implicado
(ej. `La conexión "c3" apunta a un nodo que no existe: "db"`).

**Reglas del diff (backend y frontend, idénticas):** nodos por `id`; modificado si cambia
`name`, `category`, `technology` o `description`. Conexiones: primero por `id` cuando `from` y `to`
coinciden; las que quedan sin pareja se emparejan por `from|to|label`; modificada si cambia
`label` u `order`. Resultado ordenado por id. Sin cambios → listas vacías.

---

## BACKEND (`backend/`)

### Task 1: Pruebas con `node:test` y Zod

**Files:** Modify `backend/package.json`.

- [ ] **Step 1:** Agregar script `"test": "node --test test/"` y crear carpeta `backend/test/`.
  Commit: `build: agrega script de pruebas con node:test`.
- [ ] **Step 2:** `npm install zod` (v4). Commit: `build(deps): agrega zod para validar la respuesta de la IA`.

### Task 2: Validador del JSON de Gemini

**Files:** Create `backend/src/diagramas/esquema.js`, `backend/src/diagramas/validar.js`; Test `backend/test/validar.test.js`.

**Interfaces — Produces:**
- `esquemaDiagrama` (Zod) en `esquema.js`.
- `validarDiagrama(valor: unknown): { ok: true, diagrama } | { ok: false, errores: string[] }` en `validar.js`.

- [ ] **Step 1: Tests que fallan** (`node:test` + `assert`), un caso por regla:
  `acepta un diagrama válido de arquitectura`, `acepta secuencia con orden`,
  `rechaza más de 12 nodos` (errores incluye `/máximo 12 nodos/`),
  `rechaza ids duplicados` (`/"api" está repetido/`),
  `rechaza id con mayúsculas`,
  `rechaza conexión a nodo inexistente` (`La conexión "c3" apunta a un nodo que no existe: "db"`),
  `rechaza autoconexión`, `rechaza categoría desconocida`, `rechaza secuencia sin orden`,
  `rechaza null y texto`.
- [ ] **Step 2:** `npm test` → FAIL (módulo no existe).
- [ ] **Step 3:** `esquema.js`: forma, enums y límites con Zod. Commit:
  `feat(validador): esquema Zod del diagrama que devuelve Gemini`.
- [ ] **Step 4:** `validar.js`: `safeParse` + reglas cruzadas (ids únicos, referencias, autoconexión,
  orden en secuencia), errores traducidos a español. Commit por función:
  `feat(validador): verifica ids únicos`, `feat(validador): verifica que las conexiones apunten a nodos existentes`,
  `feat(validador): exige orden en diagramas de secuencia`.
- [ ] **Step 5:** `npm test` → PASS. Commit tests: `test(validador): casos válidos e inválidos del diagrama`.

### Task 3: Contrato `.proto` y generación con Buf

**Files:** Create `backend/proto/codetodiagram/v1/diagram.proto`, `backend/buf.yaml`, `backend/buf.gen.yaml`, `backend/src/gen/codetodiagram/v1/diagram_pb.{js,d.ts}` (generado); Modify `backend/package.json`.

- [ ] **Step 1:** `npm install @bufbuild/protobuf @connectrpc/connect @connectrpc/connect-node` y
  `npm install -D @bufbuild/buf @bufbuild/protoc-gen-es`. **Un commit por paquete** (`build(deps): …`).
- [ ] **Step 2:** `buf.yaml` (`version: v2`, `modules: [{ path: proto }]`, `lint: { use: [STANDARD] }`).
  Commit: `build(grpc): configuración de Buf`.
- [ ] **Step 3:** Escribir el `.proto` según la tabla del contrato, **un commit por bloque**: enums,
  `SourceFile`, `Node`/`Edge`/`Diagram`, diff y progreso, peticiones de generación, historial,
  `service DiagramService`. Ej.: `feat(proto): mensaje Diagram con nodos y conexiones`.
  Tras cada commit `npx buf lint` → sin salida.
- [ ] **Step 4:** `buf.gen.yaml`: plugin `local: protoc-gen-es`, `out: src/gen`, `opt: [target=js+dts, import_extension=js]`.
  Scripts: `"proto:gen": "buf generate"`, `"proto:lint": "buf lint"`. Commit: `build(grpc): generación de código con protoc-gen-es`.
- [ ] **Step 5:** `npm run proto:gen` → existe `src/gen/codetodiagram/v1/diagram_pb.js`. Commit: `build(grpc): código generado del contrato`.

### Task 4: Conversión JSON ↔ proto y diff (backend)

Depende de Task 3 (tipos generados).

**Files:** Create `backend/src/diagramas/convertir.js`, `backend/src/diagramas/diff.js`; Test `backend/test/convertir.test.js`, `backend/test/diff.test.js`.

**Interfaces — Produces:**
- `jsonAProto(diagramaJson): Diagram` (usa `create(DiagramSchema, …)`), `protoAJson(diagram: Diagram): object` (forma JSON de Gemini).
- `calcularDiff(antes: Diagram, despues: Diagram): DiagramDiff` según "Reglas del diff".

- [ ] **Step 1: Tests que fallan:** `ida y vuelta conserva el diagrama`; diff:
  `sin cambios da listas vacías`, `nodo agregado`, `nodo eliminado`,
  `nodo modificado por tecnología`, `conexión renumerada (c1→c7) con mismos extremos y etiqueta no cuenta como cambio`,
  `conexión con nueva etiqueta es modificada`, `resultado ordenado por id`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** Implementar `convertir.js`. Commit: `feat(diagramas): convierte entre el JSON de Gemini y los mensajes del proto`.
- [ ] **Step 4:** Implementar `diff.js`. Commit: `feat(diff): calcula nodos y conexiones agregados, eliminados y modificados`.
- [ ] **Step 5:** `npm test` → PASS. Commits: `test(diagramas): ida y vuelta JSON ↔ proto`, `test(diff): casos del cálculo del diff`.

### Task 5: Servicio de Gemini para diagramas

**Files:** Modify `backend/src/ia.js` (agregar, no borrar `preguntarIA` todavía); Create `backend/src/diagramas/prompt.js`, `backend/src/diagramas/generar.js`; Test `backend/test/generar.test.js`.

**Interfaces:**
- Consumes: `validarDiagrama` (Task 2), `jsonAProto`, `protoAJson` (Task 4).
- Produces:
  - `llamarGeminiJson({ sistema: string, usuario: string, signal?: AbortSignal, fetchImpl? }): Promise<string>` en `ia.js`
    (`generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }`).
  - `extraerJson(texto: string): unknown` (quita cercas ```json, toma del primer `{` al último `}`; lanza `Error('La IA no devolvió JSON.')`).
  - `INSTRUCCIONES_DIAGRAMA: string`, `construirPrompt({ archivos, tipo, pregunta, anterior? }): string` en `prompt.js`.
    El prompt exige: solo JSON con la forma de la spec, máx. 12 nodos, enfocado en la pregunta si la hay,
    y si hay `anterior` **reutilizar sus ids** para lo que no cambió.
  - `generarDiagrama({ archivos, tipo, pregunta, anterior?, signal? }, { llamar = llamarGeminiJson, alProgreso = () => {} }): Promise<Diagram>`
    en `generar.js`: `alProgreso(ANALYZING)` → llamar → `alProgreso(VALIDATING)` → validar; si falla,
    `alProgreso(RETRYING)` y **un** reintento añadiendo al prompt la lista de errores; si vuelve a fallar
    lanza `ConnectError('La IA devolvió un diagrama inválido dos veces. Intenta reformular la pregunta o reducir el código.', Code.Internal)`.
    Error de red/HTTP de Gemini → `ConnectError(…, Code.Unavailable)`. Sin `GEMINI_API_KEY` → `Code.FailedPrecondition`.

- [ ] **Step 1: Tests que fallan** (con `llamar` falso): `extraerJson quita cercas markdown`,
  `extraerJson lanza si no hay objeto`, `construirPrompt incluye los ids del diagrama anterior`,
  `devuelve el diagrama si la primera respuesta es válida` (llamar llamado 1 vez),
  `reintenta una vez con los errores en el prompt` (2.ª llamada contiene `apunta a un nodo que no existe`),
  `falla con Code.Internal tras dos respuestas inválidas`, `reporta las etapas de progreso en orden`.
- [ ] **Step 2:** `npm test` → FAIL.
- [ ] **Step 3:** `llamarGeminiJson` en `ia.js`. Commit: `feat(ia): llamada a Gemini en modo JSON`.
- [ ] **Step 4:** `prompt.js`. Commits: `feat(ia): instrucciones del sistema para generar diagramas`, `feat(ia): construye el prompt con archivos, pregunta y diagrama anterior`.
- [ ] **Step 5:** `generar.js`. Commits: `feat(ia): extrae el JSON de la respuesta de Gemini`, `feat(ia): genera y valida el diagrama con un reintento`.
- [ ] **Step 6:** `npm test` → PASS. Commit: `test(ia): generación con reintento y progreso`.

### Task 6: Servidor en un puerto para HTTP/1.1 y HTTP/2 + Connect

**Files:** Create `backend/src/servidor.js`, `backend/src/grpc/rutas.js`; Modify `backend/src/index.js`; Test `backend/test/servidor.test.js`.

**Interfaces — Produces:**
- `crearServidor(manejador: (req, res) => void): net.Server` en `servidor.js`.
- `rutasGrpc(impl): (router: ConnectRouter) => void` en `rutas.js` (`router.service(DiagramService, impl)`).

Algoritmo de `crearServidor` (no lo determina la firma):

```js
const PREFACIO = 'PRI * HTTP/2.0';
const h1 = http.createServer(manejador);
const h2 = http2.createServer(manejador);
return net.createServer((socket) => {
  socket.once('data', (trozo) => {
    socket.pause();
    socket.unshift(trozo);
    (trozo.toString('latin1', 0, PREFACIO.length) === PREFACIO ? h2 : h1).emit('connection', socket);
    process.nextTick(() => socket.resume());
  });
});
```

- [ ] **Step 1: Tests que fallan:** con `crearServidor` sobre un manejador de prueba en puerto 0:
  `responde por HTTP/1.1` (`fetch`), `responde por HTTP/2 sin TLS` (`http2.connect` → `:status` 200).
- [ ] **Step 2:** `npm test` → FAIL. **Step 3:** implementar; `npm test` → PASS.
  Commits: `feat(servidor): un solo puerto que acepta HTTP/1.1 y HTTP/2`, `test(servidor): HTTP/1.1 y HTTP/2 en el mismo puerto`.
- [ ] **Step 4:** En `index.js`: `const manejador = connectNodeAdapter({ routes: rutasGrpc(impl), interceptors: [...], fallback: app })`;
  `crearServidor(corsGlobal(manejador)).listen(PORT)`. `corsGlobal` usa el paquete `cors` con el
  mismo `origin` actual y `allowedHeaders: [...connectCors.allowedHeaders, 'Authorization']`,
  `exposedHeaders: connectCors.exposedHeaders`, `methods: connectCors.allowedMethods` (`npm install @connectrpc/cors`, su propio commit);
  se quita `app.use(cors(...))` de Express (el global lo reemplaza). Mientras Task 9 no exista, `impl` es `{}` con un stub
  `generateDiagram` que lanza `Code.Unimplemented`.
  Commits: `build(deps): agrega @connectrpc/cors`, `feat(grpc): monta Connect delante de Express`, `refactor(cors): CORS común para REST y gRPC`.
- [ ] **Step 5: Verificar:** `npm run dev`; `curl localhost:3001/api/health` → JSON como antes;
  `npx buf curl --protocol grpc --http2-prior-knowledge --schema proto http://localhost:3001/codetodiagram.v1.DiagramService/GenerateDiagram -d '{}'`
  → error `unimplemented` (prueba que gRPC puro llega).

### Task 7: Interceptores de autenticación y límite

**Files:** Modify `backend/src/middleware/auth.js`; Create `backend/src/grpc/interceptores.js`, `backend/src/grpc/contexto.js`, `backend/src/limitador.js`; Test `backend/test/interceptores.test.js`, `backend/test/limitador.test.js`.

**Interfaces — Produces:**
- `verificarToken(token: string): Promise<Usuario | null>` (extraído de `requireAuth`, que pasa a usarla; lanza si la BD falla).
- `USUARIO = createContextKey(null)` en `contexto.js`.
- `crearLimitador({ limite, ventanaMs, ahora = Date.now }): { consumir(clave: string): boolean }` (ventana deslizante en memoria).
- `interceptorAuth({ verificar = verificarToken }): Interceptor` → lee `authorization: Bearer …`; sin token/ inválido → `ConnectError('Inicia sesión para continuar.' | 'Tu sesión expiró o no es válida. Inicia sesión de nuevo.', Code.Unauthenticated)`; BD caída → `Code.Unavailable`; deja el usuario en `req.contextValues.set(USUARIO, …)`.
- `interceptorLimite({ limitador = crearLimitador({ limite: 60, ventanaMs: 15*60*1000 }) }): Interceptor` → solo para `GenerateDiagram`/`StreamDiagram` (por `req.method.name`), clave `usuario-<id>`; excedido → `ConnectError('Hiciste muchas peticiones seguidas. Espera unos minutos y vuelve a intentarlo.', Code.ResourceExhausted)`.

- [ ] **Step 1:** Refactor `verificarToken` sin cambiar comportamiento REST. Commit: `refactor(auth): extrae verificarToken para reutilizarla en gRPC`.
- [ ] **Step 2: Tests que fallan:** limitador `permite hasta el límite`, `bloquea el 61`, `libera al pasar la ventana` (reloj falso);
  interceptores con `next` falso: `sin token → Unauthenticated`, `token inválido → Unauthenticated`,
  `token válido deja el usuario en el contexto`, `límite solo aplica a Generate/Stream`, `excedido → ResourceExhausted`.
- [ ] **Step 3:** Implementar; `npm test` → PASS. Commits separados: `feat(limites): limitador por ventana deslizante`,
  `feat(grpc): agrega interceptor de autenticación JWT`, `feat(grpc): interceptor de límite de peticiones a la IA`,
  `test(grpc): …`, `test(limites): …`.
- [ ] **Step 4:** Registrar `[interceptorAuth(), interceptorLimite()]` en `index.js`. Verificar con `buf curl` sin header → `unauthenticated`.
  Commit: `feat(grpc): registra los interceptores en el servidor`.

### Task 8: Tabla `diagramas` y repositorio

**Files:** Modify `backend/schema.sql`, `backend/src/index.js` (mensaje de arranque); Create `backend/src/diagramas/repositorio.js`.

**Interfaces — Produces** (todas filtran por `usuario_id`):
`guardar(usuarioId, { titulo, tipo, pregunta, archivos, diagrama }): Promise<Fila>`,
`listar(usuarioId): Promise<Fila[]>` (orden `creado_en DESC`, sin `archivos`),
`obtener(usuarioId, id): Promise<Fila | null>`, `eliminar(usuarioId, id): Promise<boolean>`.
`Fila = { id, titulo, tipo, pregunta, archivos, diagrama, creado_en }` (`diagrama` = `toJson(DiagramSchema, …)`).

- [ ] **Step 1:** `schema.sql`: `CREATE TABLE IF NOT EXISTS diagramas (id SERIAL PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE, titulo VARCHAR(200) NOT NULL, tipo VARCHAR(20) NOT NULL, pregunta TEXT DEFAULT '', archivos JSONB NOT NULL, diagrama JSONB NOT NULL, creado_en TIMESTAMP DEFAULT NOW(), actualizado_en TIMESTAMP DEFAULT NOW());` Commit: `feat(db): tabla diagramas`.
- [ ] **Step 2:** Índice `diagramas_usuario_id_idx`. Commit: `perf(db): índice por usuario en diagramas`.
- [ ] **Step 3:** `repositorio.js`, una función por commit (`feat(db): guarda un diagrama del usuario`, …).
- [ ] **Step 4: Verificar:** `npm run dev` arranca y crea la tabla (log sin errores); `psql "$DATABASE_URL" -c '\d diagramas'` muestra las columnas.

### Task 9: Implementación de `DiagramService`

**Files:** Create `backend/src/grpc/servicio.js`, `backend/src/diagramas/entrada.js`; Modify `backend/src/index.js`; Test `backend/test/servicio.test.js`.

**Interfaces:**
- Consumes: `generarDiagrama` (T5), `calcularDiff` (T4), repositorio (T8), `USUARIO` (T7), `validarDiagrama`+`protoAJson` (para `GetDiagram`/`SaveDiagram`).
- Produces: `validarEntrada({ files, type, question }): void` (lanza `Code.InvalidArgument`: "Agrega al menos un archivo.", "Máximo 10 archivos.", "El código supera los 60 000 caracteres.", "Elige un tipo de diagrama.", "La pregunta admite hasta 300 caracteres.", nombre de archivo vacío);
  `crearServicioDiagramas({ generar = generarDiagrama, repo = repositorio }): ServiceImpl<typeof DiagramService>`.
  - `generateDiagram` → `{ diagram }`.
  - `streamDiagram` (async generator) → `progress` por cada etapa, luego `diagram`, luego `diff` si vino `previous`. Pasa `ctx.signal` a `generar`.
  - `saveDiagram` valida el diagrama (`protoAJson` + `validarDiagrama`) → `InvalidArgument` si no pasa.
  - `getDiagram`/`deleteDiagram` de otro usuario o inexistente → `Code.NotFound` ("Ese diagrama no existe o no es tuyo.").

- [ ] **Step 1: Tests que fallan** (fakes de `generar` y `repo`, contexto con `createContextValues().set(USUARIO, { id: 1 })`):
  `validarEntrada` (un test por mensaje), `stream emite progreso, diagrama y diff en ese orden`,
  `stream sin previous no emite diff`, `save rechaza diagrama inválido`, `get ajeno → NotFound`, `delete ajeno → NotFound`, `list mapea node_count`.
- [ ] **Step 2:** Implementar, un commit por RPC (`feat(grpc): GenerateDiagram`, `feat(grpc): StreamDiagram con progreso y diff`, …) y `feat(grpc): valida tamaño y forma de la entrada`.
- [ ] **Step 3:** `npm test` → PASS; commits de tests.
- [ ] **Step 4: Verificar gRPC puro** con un token real (`TOKEN=$(curl -s -XPOST localhost:3001/api/auth/login -H 'content-type: application/json' -d '{"email":…,"password":…}' | jq -r .token)`):
  `npx buf curl --protocol grpc --http2-prior-knowledge --schema proto -H "authorization: Bearer $TOKEN" http://localhost:3001/codetodiagram.v1.DiagramService/StreamDiagram -d '{"files":[{"name":"a.js","content":"…"}],"type":"DIAGRAM_TYPE_ARCHITECTURE"}'`
  → varias líneas `progress`, luego `diagram`. Repetir `ListDiagrams` → `{}` o lista.

---

## FRONTEND (`frontend/`)

### Task 10: Pruebas unitarias con Vitest

**Files:** Modify `frontend/angular.json` (target `test` con builder `@angular/build:unit-test`), `frontend/package.json`; Create `frontend/tsconfig.spec.json`.

- [ ] **Step 1:** `npm install -D vitest jsdom` (un commit cada uno). Commit config: `build(test): ejecuta pruebas unitarias con Vitest`.
- [ ] **Step 2:** Prueba humo `src/app/core/fuerza.spec.ts` sobre una función existente de `fuerza.ts`. `npx ng test --watch=false` → PASS.
  Commit: `test(core): prueba de la medición de fuerza de contraseña`.

### Task 11: `.proto` sincronizado y código generado

**Files:** Create `frontend/scripts/sincronizar-proto.mjs`, `frontend/proto/codetodiagram/v1/diagram.proto` (copia), `frontend/buf.yaml`, `frontend/buf.gen.yaml`, `frontend/src/app/gen/codetodiagram/v1/diagram_pb.ts`; Modify `frontend/package.json`, `frontend/src/environments/environment*.ts` (`grpcUrl`).

- [ ] **Step 1:** Dependencias, un commit cada una: `@bufbuild/protobuf`, `@connectrpc/connect`, `@connectrpc/connect-web`; dev `@bufbuild/buf`, `@bufbuild/protoc-gen-es`.
- [ ] **Step 2:** `sincronizar-proto.mjs`: copia `../backend/proto` → `./proto`; con `--comprobar` compara byte a byte y sale con código 1 listando diferencias. Scripts
  `"proto:sync"`, `"proto:check": "node scripts/sincronizar-proto.mjs --comprobar"`, `"proto:gen": "buf generate"`. Commit: `build(grpc): script para sincronizar el .proto con el backend`.
- [ ] **Step 3:** `npm run proto:sync && npm run proto:check` → exit 0. Commit: `feat(proto): copia sincronizada del contrato del backend`.
- [ ] **Step 4:** `buf.yaml` + `buf.gen.yaml` (`out: src/app/gen`, `opt: target=ts`); `npm run proto:gen`. Commits separados (config / código generado).
- [ ] **Step 5:** `environment*.ts`: `grpcUrl: 'http://localhost:3001'` / `'https://pow-proyecto1-backend.onrender.com'`. Commit: `feat(config): URL del servicio gRPC`.
- [ ] **Step 6:** `npx ng build` → sin errores.

### Task 12: Validador del diagrama (frontend)

**Files:** Create `frontend/src/app/diagrama/validar.ts`; Test `validar.spec.ts`.

**Interfaces — Produces:** `validarDiagrama(d: Diagram | undefined): { ok: true; diagrama: Diagram } | { ok: false; errores: string[] }` con las reglas comunes y los mismos mensajes del backend.

- [ ] **Step 1:** Tests espejo de Task 2 (mismos nombres, sobre `create(DiagramSchema, …)`) + `rechaza undefined`. **Step 2:** FAIL.
- [ ] **Step 3:** Implementar, un commit por regla (`feat(validador): …`). **Step 4:** PASS; `test(validador): …`.

### Task 13: Diff (frontend)

**Files:** Create `frontend/src/app/diagrama/diff.ts`; Test `diff.spec.ts`.

**Interfaces — Produces:** `calcularDiff(antes: Diagram, despues: Diagram): DiffVista` donde
`DiffVista = { nodos: Map<string, Cambio>; aristas: Map<string, Cambio>; total: number }`,
`Cambio = 'agregado' | 'eliminado' | 'modificado'`. Las aristas eliminadas se indexan por su id **en `antes`**; agregadas y modificadas por su id en `despues`.

- [ ] Tests espejo de Task 4 (diff) + `total cuenta todos los cambios`; implementar; commits `feat(diff): …`, `test(diff): …`.

### Task 14: Layout de arquitectura y estados de cambio en `ui-diagrama`

**Files:** Create `frontend/src/app/diagrama/layout-arquitectura.ts`; Modify `frontend/src/app/diagrama/modelo.ts` (campo opcional), `diagrama.html` (clase), `diagrama.css` (**solo agregar**); Test `layout-arquitectura.spec.ts`.

**Interfaces — Produces:**
- En `modelo.ts`: `cambio?: Cambio` en `NodoDiagrama` y `AristaDiagrama` (+ `fantasma?: boolean` para eliminados en Comparar).
- `layoutArquitectura(d: Diagram, cambios?: DiffVista, eliminados?: Diagram): { nodos: NodoDiagrama[]; aristas: AristaDiagrama[] }`.
  Constantes: `ANCHO_NODO = 200`, `SEPARACION_X = 48`, `SEPARACION_Y = 72`.
  Algoritmo: (1) romper ciclos con DFS desde nodos en orden de id, ignorando aristas de retroceso;
  (2) capa = camino más largo desde una fuente; (3) dentro de cada capa, ordenar por baricentro de
  posiciones de padres en la capa anterior, empate por id; (4) filas centradas, `y` acumulando `altoNodo`.
  Mapeo: `titulo=name`, `tipo = '<Etiqueta categoría>: <technology>'` (o solo etiqueta), `forma` desde la categoría,
  `detalle=file`, `estado='normal'`; aristas `estado: 'tinta'`, `etiqueta=label`.
  Con `eliminados`, los nodos/aristas eliminados se agregan con `fantasma: true` en la posición que tenían en `antes`.
- `diagrama.html`: añadir al `[class]` de nodo/arista `' nodo--' + nodo.cambio` y `' nodo--fantasma'` (ídem `arista--`) solo cuando existan.
- `diagrama.css` (al final, bloque nuevo comentado): `.nodo--agregado` contorno `--color-exito`, `.nodo--modificado` `--color-aviso`,
  `.nodo--eliminado` `--color-error`, `.nodo--fantasma` opacidad 0.45 y trazo discontinuo; mismas variantes para `.arista--*`.

- [ ] **Step 1: Tests que fallan:** `mismo diagrama da mismas posiciones` (determinismo), `cadena A→B→C queda en 3 capas`,
  `layout con ciclo termina y asigna capas`, `nodo aislado queda en la capa 0`, `sin solapes horizontales en una capa`,
  `aplica cambio desde DiffVista`, `eliminados aparecen como fantasma`.
- [ ] **Step 2–4:** Implementar y pasar. Commits: `feat(diagrama): campo cambio en nodos y aristas`, `feat(diagrama): layout por capas determinista`,
  `feat(diagrama): marca agregados, eliminados y modificados`, `style(diagrama): colores de cambio con los tokens existentes`, `test(diagrama): …`.
- [ ] **Step 5:** `npx ng build` → sin advertencias de budget (diagrama.css < 8 kB); login y `/design` se ven igual (comparar con `docs/capturas/login-*`).

### Task 15: Diagrama de secuencia y registro de tipos

**Files:** Create `frontend/src/app/diagrama/secuencia/layout-secuencia.ts`, `secuencia.ts`, `secuencia.html`, `secuencia.css`, `frontend/src/app/diagrama/tipos.ts`; Test `layout-secuencia.spec.ts`.

**Interfaces — Produces:**
- `layoutSecuencia(d: Diagram, cambios?: DiffVista): { participantes: { id; titulo; x; cambio? }[]; mensajes: { id; deX; aX; y; etiqueta; cambio? }[]; ancho; alto }`
  (participantes por orden de aparición en mensajes, luego por id; `x = i * 180 + 90`; mensajes por `order`, empate por id; `y = 80 + k * 44`).
- Componente `ui-diagrama-secuencia` con inputs `diagrama = input.required<Diagram>()`, `cambios = input<DiffVista | undefined>()`; SVG con líneas de vida (`--color-lapiz`), flechas y etiquetas en `--font-codigo`, clases de cambio iguales a Task 14.
- `tipos.ts`: `TIPOS_DIAGRAMA: Record<DiagramType.ARCHITECTURE | DiagramType.SEQUENCE, { etiqueta: string }>`
  (`'Arquitectura'`, `'Secuencia'`) — agregar un tipo = una entrada + un layout + un componente.

- [ ] Tests: `participantes en orden de aparición`, `mensajes ordenados por order con empate por id`, `aplica cambios`.
  Commits: layout, componente, estilos (`style(secuencia): …`), registro de tipos, tests.

### Task 16: Cliente gRPC-Web y errores

**Files:** Create `frontend/src/app/services/diagramas.service.ts`; Modify `frontend/src/app/core/errores.ts` (agregar función); Test `frontend/src/app/core/errores-grpc.spec.ts`.

**Interfaces — Produces:**
- `DiagramasService` (`providedIn: 'root'`): cliente `createClient(DiagramService, createGrpcWebTransport({ baseUrl: environment.grpcUrl, interceptors: [auth] }))`;
  el interceptor agrega `authorization: Bearer <token>` y ante `Code.Unauthenticated` llama `auth.cerrarSesion()` y navega a `/login?sesion=expirada`.
  Métodos: `stream(req, signal): AsyncIterable<StreamDiagramResponse>`, `guardar`, `listar`, `obtener(id)`, `eliminar(id)`.
- `mapearErrorGrpc(err: unknown): (ErrorInterfaz & { despertando?: boolean }) | null`:
  `Unavailable`/`Unknown` sin respuesta → `{ mensaje: 'El servidor está despertando, reintentando…', despertando: true }`;
  `ResourceExhausted`/`InvalidArgument`/`NotFound`/`Internal`/`FailedPrecondition` → el mensaje del servidor;
  `Canceled` → `null` (no se muestra nada); otro → mensaje genérico existente.

- [ ] Tests: uno por código. Commits: `feat(grpc): cliente gRPC-Web del servicio de diagramas`, `feat(grpc): interceptor que envía el JWT`,
  `feat(grpc): cierra la sesión si el token ya no es válido`, `feat(errores): traduce los errores gRPC a mensajes de interfaz`, `test(errores): …`.

### Task 17: Editor de código con pestañas

**Files:** Create `frontend/src/app/ui/editor/editor.ts`, `editor.html`, `editor.css`.

**Interfaces — Produces:** `ui-editor` con `archivos = model.required<ArchivoEditor[]>()`, `ArchivoEditor = { nombre: string; contenido: string }`;
pestañas (agregar, renombrar con doble clic, quitar si hay > 1, máximo 10), `textarea` con gutter de números sincronizado por scroll,
`spellcheck=false`, Tab inserta 2 espacios, `aria-label` por pestaña. Solo tokens actuales y `--font-codigo`.

- [ ] Commits: estructura, pestañas, números de línea, tecla Tab, estilos, accesibilidad (uno cada uno). Prueba manual en `/app` tras Task 20.

### Task 18: Exportar SVG y PNG

**Files:** Create `frontend/src/app/diagrama/exportar.ts`; Test `exportar.spec.ts`.

**Interfaces — Produces:** `serializarSvg(svg: SVGSVGElement): string` (clona, copia en línea `fill, stroke, stroke-width, stroke-dasharray, stroke-dashoffset, opacity, font-family, font-size, font-weight` computados, añade `xmlns` y fondo `--color-superficie`);
`svgAPng(svgTexto: string, ancho: number, alto: number, escala = 2): Promise<Blob>`; `descargar(blob: Blob, nombre: string): void`.

- [ ] Tests: `incluye xmlns`, `copia el estilo de trazo en línea`. Commits por función + test.

### Task 19: Lógica del espacio de trabajo

**Files:** Create `frontend/src/app/pages/inicio/espacio-trabajo.ts`; Test `espacio-trabajo.spec.ts`.

**Interfaces:**
- Consumes: `DiagramasService` (T16), `validarDiagrama` (T12), `calcularDiff` (T13), `mapearErrorGrpc` (T16).
- Produces: `EspacioTrabajo` (provisto en el componente) con signals
  `archivos`, `tipo` (`DiagramType`), `pregunta`, `estado: 'vacio' | 'generando' | 'listo' | 'error'`, `progreso: string`,
  `antes: Diagram | null`, `despues: Diagram | null`, `diff: DiffVista | null`, `vista: 'antes' | 'despues' | 'comparar'`, `error: ErrorInterfaz | null`, `guardadoId: number | null`;
  métodos `generar()`, `alEditar()`, `reintentar()`, `cargarGuardado(id)`, `guardar()`.
  Reglas: `alEditar` → debounce 2000 ms; solo si `clave()` (JSON de archivos+tipo+pregunta) difiere de la última generada y hay un `despues`; respeta 5000 ms desde la última generación automática (si no, reprograma);
  cada generación aborta la anterior (`AbortController`) y lleva un número de secuencia: respuestas con número viejo se descartan;
  envía `previous = despues`; al terminar, `antes = despues previo`, `despues = nuevo`, `diff = calcularDiff`, `vista = 'despues'`;
  validación fallida → `estado 'error'` sin tocar `despues`; error `despertando` → reintenta hasta 3 veces cada 8 s mostrando el progreso, luego error;
  `cargarGuardado` valida el diagrama guardado y lo deja como `despues` y `antes = null` (será el "Antes" de la primera edición).

- [ ] **Tests que fallan** (Vitest, `vi.useFakeTimers`, servicio falso): `no regenera antes de 2 s`, `no regenera si el contenido no cambió`,
  `respeta 5 s entre regeneraciones automáticas`, `descarta respuestas obsoletas`, `diagrama inválido deja estado error y conserva el anterior`,
  `calcula el diff contra el diagrama previo`, `reintenta 3 veces si el servidor está despertando`, `cargarGuardado inválido da error y no dibuja`.
- [ ] Implementar en commits pequeños (debounce, clave, intervalo mínimo, cancelación, diff, reintentos, carga); tests PASS.

### Task 20: Página `/app` reescrita

**Files:** Rewrite `frontend/src/app/pages/inicio/inicio.{ts,html,css}`; Delete `frontend/src/app/pages/inicio/arquitectura-app.ts`, `frontend/src/app/services/api.service.ts`.

Contenido: cabecera actual (marca, `ui-theme-toggle`, avatar, cerrar sesión, enlace "Historial"); columna izquierda `ui-editor`,
selector de tipo (desde `TIPOS_DIAGRAMA`), campo pregunta (`ui-text-field`), botón Generar (`ui-button`);
columna derecha: progreso, `ui-alert` de error con botón Reintentar, selector **Antes / Después / Comparar** (deshabilitado sin `antes`),
resumen del diff ("2 agregados · 1 modificado"), el diagrama (`ui-diagrama` con `layoutArquitectura` o `ui-diagrama-secuencia` según tipo),
botones Guardar, Exportar SVG, Exportar PNG. Móvil (< 900 px): una columna. Lee `?diagrama=<id>` para `cargarGuardado`.

- [ ] Commits: quitar CRUD de items, quitar caja IA, quitar panel de arquitectura y `ApiService` (`refactor: elimina … que ya no se usa`), estructura nueva, cada control, estilos, responsive.
- [ ] **Verificar:** `npx ng build` sin errores ni advertencias; `ng serve` + backend local: generar, editar → diff, cambiar vistas, exportar ambos formatos.

### Task 21: Historial

**Files:** Create `frontend/src/app/pages/historial/historial.{ts,html,css}`; Modify `frontend/src/app/app.routes.ts`.

Ruta `/historial` con `authGuard`: lista (título, tipo, pregunta, nº nodos, fecha con `DatePipe`), "Abrir" → `/app?diagrama=<id>`,
"Eliminar" con confirmación en línea (no `confirm()`), estado vacío y error con Reintentar.

- [ ] Commits: ruta, página, abrir, eliminar, estilos. Verificar guardar → aparece → abrir → eliminar.

---

## Cierre

### Task 22: Eliminar código viejo del backend

**Files:** Delete `backend/src/routes/items.js`, `backend/src/routes/ia.js`; Modify `backend/src/index.js`, `backend/src/ia.js` (quitar `preguntarIA` e `INSTRUCCIONES`), `backend/src/middleware/limites.js` (quitar `limiteIA`), `backend/schema.sql` (`DROP TABLE IF EXISTS items;` reemplazando su creación), mensaje de arranque.

- [ ] Un commit por elemento (`refactor: elimina la ruta /api/items`, …). `npm test` PASS; `curl /api/health` OK; `/api/items` → 404.

### Task 23: Documentación del backend

Un commit `docs:` por archivo: `docs/grpc.md` (por qué, contrato, regenerar, `buf curl`, diagrama de flujo mermaid, Render: gRPC puro solo local),
`docs/ia.md` (prompt, JSON esperado, validación, reintento), actualizar `api.md`, `base-de-datos.md`, `seguridad.md` (JWT en REST y gRPC, CORS, límites),
`despliegue.md`, `arquitectura-backend.md` (servidor h1/h2, interceptores, flujo), ADRs `docs/decisiones/0001-connect-para-grpc.md`,
`0002-zod-para-validar-la-ia.md`, `0003-un-puerto-http1-y-http2.md`, `0004-diagrama-anterior-en-el-prompt.md`, `0005-codigo-generado-en-el-repo.md`, `CHANGELOG.md`, `README.md`.

### Task 24: Documentación del frontend

Un commit `docs:` por archivo: `docs/funcionalidades.md`, `docs/diagramas.md`, `docs/grpc-cliente.md`, actualizar `docs/arquitectura-frontend.md`,
ADRs `0005-editor-textarea-propio.md`, `0006-grpc-web-con-connect.md`, `0007-layout-determinista-por-capas.md`, `0008-validar-tambien-en-el-cliente.md`,
capturas nuevas de `/app` y `/historial` (claro/oscuro, escritorio/móvil), `CHANGELOG.md`, `README.md`.

### Task 25: Verificación final

- [ ] `backend: npm test` y `frontend: npx ng test --watch=false` → todo PASS.
- [ ] `frontend: npm run proto:check` → exit 0; `npx ng build` → sin errores ni advertencias.
- [ ] Flujo completo local: registro, login, generar, editar y ver diff, guardar, abrir del historial, exportar SVG/PNG, eliminar, login fallido, backend apagado (alerta y reintentos).
- [ ] gRPC puro con `buf curl` (Task 9 Step 4) y gRPC-Web desde el navegador (pestaña Red: `content-type: application/grpc-web+proto`).
- [ ] `../demo.sh` levanta ambos y el flujo funciona.
- [ ] `git status` limpio en ambos repos; `git log` sin `.env`/`dist`. **Pedir al usuario aprobación para el push** (confirmar: no hay variables de entorno nuevas).
- [ ] Tras el push aprobado: en Render, gRPC-Web unario y streaming desde el frontend desplegado; `buf curl --protocol grpc` contra Render (se espera fallo, documentarlo). Si el streaming falla allí, avisar y proponer `GenerateDiagram` unario con progreso simulado.
