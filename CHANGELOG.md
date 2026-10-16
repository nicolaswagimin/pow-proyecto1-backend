# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/).

## [Sin publicar] · 2026-10-15

### Agregado
- Servicio de diagramas por gRPC con Connect (`DiagramService`): `GenerateDiagram`, `StreamDiagram` (progreso, diagrama y diff), `SaveDiagram`, `ListDiagrams`, `GetDiagram` y `DeleteDiagram`.
- Contrato `proto/codetodiagram/v1/diagram.proto` con lint y generación de código con Buf (`npm run proto:lint`, `npm run proto:gen`).
- Un solo puerto para HTTP/1.1 y HTTP/2: gRPC puro, gRPC-Web y Connect sin proxy Envoy (`src/servidor.js`).
- Interceptores gRPC: JWT en el metadato `authorization` y límite de 60 generaciones cada 15 minutos por usuario.
- Generación de diagramas con Gemini en modo JSON, enfocados en una pregunta opcional y con el diagrama anterior en el prompt para mantener los ids.
- Validación del JSON de la IA con Zod y reglas propias (máximo 12 nodos, ids únicos, conexiones a nodos existentes, orden en secuencia), con un reintento que le explica los errores a Gemini.
- Diff entre versiones de un diagrama (agregados, eliminados y modificados).
- Tabla `diagramas` para el historial de cada usuario.
- Pruebas automáticas con `node:test` (`npm test`), con Gemini y base de datos simulados.

### Cambiado
- `requireAuth` usa la nueva `verificarToken`, compartida con el interceptor gRPC.

### Eliminado
- Rutas `/api/items` (CRUD de ejemplo) y `/api/ia` (preguntas de texto libre), con su límite. La tabla `items` deja de crearse pero no se borra.

### Corregido
- Las fechas de `diagramas` usan `TIMESTAMPTZ`: con `TIMESTAMP` el historial mostraba 5 horas de diferencia.

### Documentación
- Nuevos `docs/grpc.md`, `docs/ia.md` y decisiones `docs/decisiones/0001` a `0005`.
- Actualizados `api.md`, `base-de-datos.md`, `seguridad.md`, `despliegue.md` y `arquitectura-backend.md`.

## 2026-10-12

### Documentación
- El proyecto pasa a llamarse **CodeToDiagram** en el README.
- `docs/api.md`: cada endpoint con request, response y errores.
- `docs/base-de-datos.md`: tablas, columnas, relaciones y consultas.
- `docs/seguridad.md`: bcrypt, JWT, CORS, límites de intentos, variables de entorno y pendientes conocidos.
- `docs/despliegue.md`: Neon, Render, variables y comprobaciones.
- `docs/arquitectura-backend.md`: carpetas, middleware en orden y flujo de una petición.

El código no cambió.

## 2026-10-06

### Agregado
- Autenticación con correo y contraseña: registro, login y `/yo`, con bcrypt y JWT.
- Límites de intentos: 10 logins cada 15 min por IP y 30 preguntas a la IA cada 15 min por usuario.
- Items filtrados por usuario (`usuario_id` con `ON DELETE CASCADE`).
- Tabla `usuarios` lista para un futuro login con Google (`google_id`, `avatar_url`, `proveedor`).

### Base inicial
- Express con CORS configurable, PostgreSQL (Neon o Supabase) con creación automática de tablas, Gemini por API REST y `/api/health`.
