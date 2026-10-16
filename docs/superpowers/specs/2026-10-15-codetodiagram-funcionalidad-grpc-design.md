# CodeToDiagram: diagramas desde código con IA, diff reactivo y gRPC (diseño)

Fecha: 2026-10-15 · Afecta a los dos repos: `CodeToDiagram/backend` (remoto `pow-proyecto1-backend`)
y `CodeToDiagram/frontend` (remoto `pow-proyecto1-frontend`). La especificación original del
usuario hablaba de `1_Proyect/`; esa carpeta ahora se llama `CodeToDiagram/`.

## 1. Intención

CodeToDiagram es el proyecto 1 de Final_Proyect: un visualizador reactivo de arquitectura. El
usuario pega código (uno o varios archivos) y obtiene un diagrama interactivo. Al editar el
código, el diagrama se actualiza solo y **muestra qué cambió**. El diff antes/después es lo
que más importa para la demo.

Las ideas vienen de Archify (https://github.com/tt-a1i/archify). Archify es una skill para
agentes que genera HTML, así que **tomamos sus ideas y no su código**:

1. La IA y el dibujo van separados. Gemini solo entiende el código y devuelve JSON. Angular
   hace el layout y el dibujo de forma determinista.
2. Se valida antes de dibujar y se falla cerrado: nunca se dibuja un diagrama roto o a medias.
3. Hay varios tipos de diagrama.
4. El diagrama sigue a la edición del código.
5. Diff antes/después, basado en el JSON intermedio.
6. Diagramas pequeños que responden una pregunta, en lugar de mapearlo todo.

Además, el profesor exige que al menos un proyecto use gRPC, y será este.

## 2. Objetivos

- Generar un diagrama de **arquitectura** o de **secuencia** a partir de código pegado en
  pestañas por archivo, con una pregunta opcional que lo enfoca.
- Validar el JSON en el backend y otra vez en el frontend. Si falla, se muestra un error claro
  con un botón para reintentar y no se dibuja nada.
- Edición reactiva: el editor y el diagrama están lado a lado, y el diagrama se regenera después
  de una pausa al escribir.
- Diff de nodos y conexiones (agregados, eliminados y modificados), con un selector
  **Antes / Después / Comparar**.
- Guardar diagramas por usuario con historial: listar, abrir y eliminar.
- Exportar el diagrama como SVG y como PNG.
- El servicio de diagramas va por gRPC (Connect). El servidor acepta gRPC, gRPC-Web y Connect a
  la vez, y el frontend usa gRPC-Web.
- Un historial de commits muy detallado y documentación por tema (ver §9 y §10).

## 3. No objetivos

- Los tipos flujo de trabajo, flujo de datos y ciclo de vida **no** se implementan ahora. La
  arquitectura queda preparada para agregarlos: un valor más en el enum, un layout y un
  componente de dibujo.
- No se analizan repositorios completos ni se suben carpetas. Solo se trabaja con código pegado.
- No hay colaboración en tiempo real ni diagramas compartidos entre usuarios.
- Login, registro y `/api/health` siguen en REST **sin cambios**.
- No se usa un proxy Envoy.
- No se usa CodeMirror ni Monaco.

## 4. Antiobjetivos (cosas que harían fracasar el proyecto aunque funcione)

- Tocar el diseño existente: estilos, tokens, colores, tipografía, animaciones, login, registro
  o `auth-layout`. Las pantallas nuevas usan solo los tokens y componentes actuales. Si un
  componente nuevo hace falta, se crea con esos tokens. **Cualquier cambio a un estilo existente
  se le pregunta antes al usuario.**
- Dibujar un diagrama parcial o inconsistente cuando la IA devuelve basura.
- Un diff lleno de cambios falsos porque la IA renombró los `id` entre una versión y otra.
- Diagramas ilegibles con decenas de nodos.
- Commits inflados, vacíos o inventados. También commits que no compilan, o que incluyen
  `.env`, `node_modules`, `dist` o `.angular`.
- Hacer `git push` sin la aprobación del usuario. El push a `main` redespliega Render.
- Agregar una variable de entorno nueva sin avisarle antes al usuario para que la configure en
  Render.

## 5. Restricciones y punto de partida

- **Backend:** Node ≥ 20, Express 5, JavaScript ESM (sin TypeScript), `pg` contra Neon. Gemini
  se llama por REST con `fetch` en `src/ia.js` (modelo `gemini-2.5-flash` por defecto). Usa
  JWT, bcryptjs y `express-rate-limit`. En local corre en el puerto 3001. Hoy tiene `items` (CRUD
  de ejemplo) y `/api/ia` (texto libre), y los dos se eliminan.
- **Frontend:** Angular 22, TypeScript 6, componentes standalone, con su propio design system
  (tokens, B612 y B612 Mono, `ui/*`). En local corre en el puerto 4201. Ya tiene `ui-diagrama`
  (SVG propio con notación C4, rutas ortogonales y estados), pero los nodos llevan `x/y`
  escritos a mano: **falta un layout automático**. También tiene guard e interceptor JWT para
  REST.
- **Despliegue:** el backend está en Render con redespliegue automático en cada push a `main`.
  El proxy de Render reenvía a la app por HTTP/1.1, así que **gRPC puro casi seguro no
  funcionará en Render**. gRPC-Web, incluido el server streaming, sí debería funcionar.
- `buf` y `grpcurl` no están instalados globalmente. Buf entra como dependencia de desarrollo
  por npm (`@bufbuild/buf`).

## 6. Diseño

### 6.1 Flujo de usuario

1. Después del login, `/app` muestra un editor con pestañas por archivo (nombre y contenido),
   un selector de tipo (arquitectura o secuencia), un campo opcional "¿qué quieres entender?" y
   el botón Generar.
2. Al generar, `StreamDiagram` envía eventos de progreso ("analizando", "validando", "dibujando")
   y al final un diagrama **ya validado**. El frontend lo valida otra vez y lo dibuja.
3. Si se edita el código con un diagrama ya dibujado, después de una pausa de unos 2 s se cancela
   la petición en curso y se vuelve a generar. El diagrama anterior se envía a Gemini para que
   **mantenga los mismos `id`** y el diff no salga lleno de cambios falsos **(decisión de
   Claude)**.
4. Al llegar el nuevo diagrama, se calcula el diff y se resaltan los nodos y conexiones
   agregados, eliminados y modificados. El selector Antes / Después / Comparar cambia la vista.
5. Guardar crea una entrada en el historial. Desde el historial se abre (con el código y el
   diagrama) o se elimina un diagrama guardado. Exportar descarga un SVG o un PNG.

### 6.2 Contrato JSON del diagrama (lo que devuelve Gemini)

```jsonc
{
  "tipo": "arquitectura",            // "arquitectura" | "secuencia"
  "titulo": "string",
  "descripcion": "string",           // 1–2 frases: qué responde el diagrama
  "nodos": [
    { "id": "api", "nombre": "API REST", "categoria": "contenedor",
      "tecnologia": "Express", "descripcion": "string", "archivo": "src/index.js" }
  ],
  "conexiones": [
    { "id": "c1", "de": "web", "a": "api", "etiqueta": "POST /login", "orden": 1 }
  ]
}
```

- `categoria` es un enum cerrado con exactamente las cinco formas C4 que ya dibuja `ui-diagrama`
  (persona, componente, contenedor, base-datos, externo), sin capa de traducción **(decisión de
  Claude)**. La tecnología concreta va en `tecnologia`.
- `orden` es obligatorio en secuencia e ignorado en arquitectura.
- Límites: de 1 a 12 nodos, ids únicos y con formato `[a-z0-9-]+`, y conexiones que solo apuntan
  a nodos que existen.
- El mismo contrato existe como mensajes del `.proto`. El JSON es solo el formato que se le pide
  a Gemini.

### 6.3 Validación en dos capas

- **Backend:** se usa Zod **(decisión de Claude)**. Valida la forma, los enums, los límites, los
  ids únicos y la integridad referencial. Si falla, reintenta **una vez** con Gemini y le pasa
  el error. Si vuelve a fallar, responde con un error gRPC claro (`INVALID_ARGUMENT` si el
  código del usuario está vacío o es demasiado grande, `UNAVAILABLE` o `INTERNAL` si falla la
  IA) y con un mensaje en español.
- **Frontend:** un validador propio en TypeScript, con funciones puras y probado, revisa las
  mismas reglas sobre el mensaje recibido antes de dibujar. Si falla, no dibuja nada y muestra
  un error con un botón para reintentar.

### 6.4 Dibujo determinista

- **Arquitectura:** un layout por capas en funciones puras dentro de `diagrama/`. Asigna niveles
  según las conexiones (ordenación topológica con manejo de ciclos), orden estable por `id` y
  posiciones `x/y` en una grilla fija. El dibujo reutiliza `ui-diagrama`, que ya dibuja C4 con
  rutas ortogonales. El mismo JSON siempre da el mismo dibujo.
- **Secuencia:** un componente nuevo con líneas de vida (un participante por nodo) y mensajes
  ordenados por `orden`, hecho con los tokens actuales.
- Preparado para crecer: un registro `tipo → { layout, componente }`, para que un tipo nuevo no
  toque los existentes.

### 6.5 Diff

- Es una función pura `diff(antes, despues)`. Empareja nodos y conexiones por `id`. Una conexión
  sin `id` estable se empareja por `de + a + etiqueta`.
- Un nodo está **modificado** si cambia `nombre`, `categoria`, `tecnologia` o `descripcion`. Una
  conexión está modificada si cambia la `etiqueta` o el `orden`.
- Vistas: **Antes** muestra el diagrama anterior con los eliminados marcados. **Después** muestra
  el nuevo con los agregados y modificados marcados. **Comparar** muestra la unión, con los
  eliminados en estilo "fantasma". Los estados visuales usan tokens existentes (por ejemplo, los
  de éxito, error y advertencia) mediante clases nuevas del componente.

### 6.6 gRPC

- **Contrato:** `proto/codetodiagram/v1/diagram.proto` vive en el backend. El frontend tiene una
  copia idéntica, sincronizada con un script documentado (por ejemplo `npm run proto:sync`), y
  una comprobación que falla si las dos difieren.
- **Generación:** Buf (`buf.yaml` y `buf.gen.yaml`) con `protoc-gen-es`. En el backend genera
  JS con `.d.ts`, y en el frontend genera TS.
- **Servicio `DiagramService`:**
  - `GenerateDiagram` (unario): archivos, tipo y pregunta opcional → diagrama validado o error.
  - `StreamDiagram` (server streaming): archivos, tipo, pregunta y diagrama anterior opcional →
    eventos `progreso` y, al final, `diagrama`. Si se envió un diagrama anterior, también envía
    el `diff` calculado en el servidor **(decisión de Claude: el frontend lo recalcula de todos
    modos para dibujarlo; el del servidor sirve para la demo de gRPC puro)**.
  - `SaveDiagram`, `ListDiagrams`, `GetDiagram` y `DeleteDiagram` (unarios) para el historial.
    `SaveDiagram` se agrega a lo que sugería el usuario, porque sin él no hay forma de guardar.
- **Servidor:** Connect para Node (`@connectrpc/connect-node`) en el mismo proceso que Express.
  Un solo puerto acepta HTTP/1.1 y HTTP/2 (h2c) detectando el protocolo de cada conexión
  **(decisión de Claude)**. Así, en local, funcionan gRPC puro (`buf curl --protocol grpc
  --http2-prior-knowledge`), gRPC-Web y Connect.
- **Autenticación:** el JWT viaja en el metadato `authorization: Bearer …`. Un interceptor del
  servidor lo valida con el mismo secreto y lógica que `requireAuth`, y deja al usuario en el
  contexto. Si falta o no es válido, responde `UNAUTHENTICATED`.
- **Límite (decidido por el usuario):** sube a **60 cada 15 min por usuario**. Se aplica a
  `GenerateDiagram` y `StreamDiagram` dentro de un interceptor y responde `RESOURCE_EXHAUSTED`.
  Cuenta **una por petición**; el reintento interno por validación no cuenta. Para ahorrar
  llamadas, el frontend solo regenera si el contenido de los archivos cambió de verdad (se
  compara un hash) y deja **al menos unos 5 s** entre regeneraciones automáticas.
- **Código generado (decisión de Claude):** el código que genera Buf se commitea en los dos
  repos, así Render no necesita ejecutar Buf al desplegar.
- **Tamaño máximo de entrada (decisión de Claude):** hasta 10 archivos y unos 60 KB en total.
  Si se supera, responde `INVALID_ARGUMENT` con un mensaje claro.
- **CORS:** se agregan los headers de gRPC-Web y Connect (por ejemplo, `@connectrpc/cors`)
  respetando la lista de `FRONTEND_URL`.
- **Cliente:** `@connectrpc/connect-web` con `createGrpcWebTransport`, y un interceptor que
  agrega el JWT de `AuthService`. Un `UNAUTHENTICATED` cierra la sesión, igual que hoy pasa con
  un 401 en REST.
- **Render:** se verifica que gRPC-Web, unario y streaming, funcione detrás del proxy. Lo
  esperado es que gRPC puro no funcione allí. Si fuera así, se demuestra en local y se documenta.
  Si el streaming también fallara, se avisa al usuario y se propone `GenerateDiagram` unario con
  progreso simulado como alternativa.

### 6.7 Base de datos

- Se elimina la tabla `items`. La sentencia que la borra queda en `schema.sql`, porque el esquema
  es idempotente y se ejecuta al arrancar.
- Tabla nueva `diagramas`: `id`, `usuario_id` (FK a `usuarios` con `ON DELETE CASCADE`),
  `titulo`, `tipo`, `pregunta`, `archivos` (JSONB con nombre y contenido), `diagrama` (JSONB),
  `creado_en` y `actualizado_en`, con un índice por `usuario_id`.
- El **historial** es la lista de diagramas guardados del usuario, del más reciente al más
  antiguo **(decisión de Claude: no se guardan versiones de un mismo diagrama, cada guardado es
  una fila nueva)**.

### 6.8 Frontend

- `/app` se convierte en el espacio de trabajo: editor a la izquierda, diagrama a la derecha y,
  en móvil, uno encima del otro. Se agrega una vista de historial (ruta o panel; queda a criterio
  del constructor, siempre con los tokens actuales).
- **Permiso del usuario:** `inicio.html` e `inicio.css` se pueden reescribir por completo con los
  tokens y componentes actuales. En `diagrama.css` solo se **agregan** clases nuevas para el
  diff; las reglas existentes no se tocan, porque login y `/design` usan ese componente.
- **El panel "Arquitectura de esta app" se elimina (decidido por el usuario)**, junto con
  `arquitectura-app.ts` y la consulta a `/api/health` desde el frontend. Si el backend no
  responde, se muestra una alerta clara a partir del error de transporte gRPC, con un aviso
  propio para el arranque en frío de Render (un mensaje del tipo "el servidor está despertando,
  reintentando…"). `/api/health` sigue existiendo en el backend.
- **Base del diff al abrir un diagrama guardado (decisión de Claude):** el diagrama guardado es
  el "Antes" de la primera edición.
- **Editor:** un componente nuevo con un `textarea` y números de línea, hecho con los tokens
  actuales (B612 Mono). Tiene pestañas por archivo para agregar, renombrar y quitar **(decisión
  de Claude, en lugar de CodeMirror)**.
- Se eliminan `ApiService` (items e IA) y todo lo que ya no se use. La página de guía `/design`
  y el login no se tocan.
- **Exportación:** SVG serializando el `<svg>` con los estilos computados en línea. PNG pintando
  ese SVG en un `canvas`.

## 7. Variables de entorno

No se prevé ninguna variable nueva. Si durante la construcción aparece alguna, **se avisa al
usuario antes del push** para que la configure en Render.

## 8. Verificación

- `ng build` de producción sin errores ni advertencias. Si un budget se excede, se ajusta con
  justificación o se optimiza.
- Pruebas automáticas, como mínimo del validador (backend y frontend) y del diff. También del
  layout, si es barato.
- gRPC puro con `buf curl` contra el servidor local. gRPC-Web desde el navegador.
- Flujo completo en local: registro, login, generar, editar y ver el diff, guardar, abrir desde
  el historial, exportar SVG y PNG, eliminar, login fallido y backend apagado (con error claro en
  la interfaz).
- `demo.sh` (en `Final_Proyect/`) sigue funcionando.
- Verificación en Render después del push aprobado por el usuario.

## 9. Commits

- Muchos commits pequeños y reales en los dos repos, uno por cada cambio mínimo con sentido.
  Cuando un archivo tiene cambios de naturaleza distinta, se separan con `git add -p`.
- Conventional Commits en español, con alcance cuando aplique. Por ejemplo:
  `feat(grpc): agrega interceptor de autenticación JWT`.
- La app compila y funciona en cada commit. Nunca se suben `.env`, `node_modules`, `dist` ni
  `.angular`.
- Solo commits locales. **No se hace push hasta que el usuario lo apruebe.**

## 10. Documentación (cada archivo en su propio commit `docs:`)

- **Backend `docs/`:** `grpc.md`, `ia.md` y la carpeta `decisiones/` con ADRs
  (`0001-connect-para-grpc.md`, `0002-zod-para-validar-la-ia.md`,
  `0003-un-puerto-http1-y-http2.md`, etc.). Se actualizan `api.md`, `base-de-datos.md`,
  `seguridad.md`, `despliegue.md` y `arquitectura-backend.md`, que ya existen, además de
  `CHANGELOG.md` y `README.md`.
- **Frontend `docs/`:** `funcionalidades.md`, `diagramas.md`, `grpc-cliente.md` y ADRs nuevos a
  partir de `0005-…` (ya existen del 0001 al 0004). Se actualizan `arquitectura-frontend.md`,
  `CHANGELOG.md` y `README.md`, con capturas nuevas de `/app`.
- Todo en español, claro y sin relleno.

## 11. Queda a criterio del constructor

- Nombres exactos de los mensajes y campos del `.proto`, siempre que cubran §6.2 y §6.6.
- El algoritmo concreto del layout por capas y sus medidas, siempre que sea determinista y
  legible con 12 nodos.
- El framework de pruebas (por ejemplo `node:test` en el backend y el runner que ya trae Angular
  en el frontend).
- El texto exacto del prompt de Gemini (documentado en `ia.md`) y el uso del modo JSON
  (`responseMimeType: application/json`) de Gemini.
- La forma del historial (ruta propia o panel) y la disposición exacta en móvil, con los tokens
  actuales.
- El orden de los commits, mientras cada uno compile.
