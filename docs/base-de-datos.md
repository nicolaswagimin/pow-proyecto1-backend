# Base de datos · CodeToDiagram

PostgreSQL alojado en Neon (también funciona con Supabase o un PostgreSQL local con `DB_SSL=false`). El esquema está en `schema.sql` y se ejecuta solo al arrancar (`iniciarDB()` en `src/db.js`). Todas las sentencias son idempotentes: se pueden ejecutar muchas veces sin romper nada.

## Diagrama

```
usuarios                          diagramas
┌───────────────────────────┐     ┌────────────────────────────────┐
│ id            SERIAL  PK  │◄──┐ │ id             SERIAL  PK      │
│ nombre        VARCHAR(100)│   └─┤ usuario_id     INTEGER FK      │
│ email         VARCHAR(255)│     │ titulo         VARCHAR(200)    │
│ password_hash TEXT        │     │ tipo           VARCHAR(20)     │
│ google_id     VARCHAR(255)│     │ pregunta       TEXT            │
│ avatar_url    TEXT        │     │ archivos       JSONB           │
│ proveedor     VARCHAR(20) │     │ diagrama       JSONB           │
│ creado_en     TIMESTAMP   │     │ creado_en      TIMESTAMPTZ     │
└───────────────────────────┘     │ actualizado_en TIMESTAMPTZ     │
                                  └────────────────────────────────┘
Un usuario tiene muchos diagramas guardados (su historial).
Al borrar el usuario se borran sus diagramas.
```

## `usuarios`

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | Identificador; es el `sub` del JWT |
| `nombre` | `VARCHAR(100)` | `NOT NULL` | Nombre para mostrar |
| `email` | `VARCHAR(255)` | `UNIQUE NOT NULL` | Siempre en minúsculas (lo normaliza la API) |
| `password_hash` | `TEXT` | `NULL` | Hash bcrypt. Nulo para cuentas que solo usen Google |
| `google_id` | `VARCHAR(255)` | `UNIQUE NULL` | Reservado para el login con Google |
| `avatar_url` | `TEXT` | `NULL` | Reservado para el login con Google |
| `proveedor` | `VARCHAR(20)` | `DEFAULT 'local'` | `local` o, en el futuro, `google` |
| `creado_en` | `TIMESTAMP` | `DEFAULT NOW()` | Fecha de registro |

`password_hash` y `google_id` nunca salen del backend: las consultas usan `COLUMNAS_PUBLICAS` (`id, nombre, email, avatar_url, proveedor, creado_en`).

## `diagramas`

El historial: cada vez que el usuario pulsa **Guardar** se crea una fila nueva (no se guardan versiones de un mismo diagrama).

| Columna | Tipo | Restricciones | Descripción |
|---|---|---|---|
| `id` | `SERIAL` | `PRIMARY KEY` | Es el `id` de `SavedDiagram` en gRPC |
| `usuario_id` | `INTEGER` | `NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE` | Dueño del diagrama |
| `titulo` | `VARCHAR(200)` | `NOT NULL` | El que escribió el usuario o, si no, el que puso la IA |
| `tipo` | `VARCHAR(20)` | `NOT NULL` | `arquitectura` o `secuencia` |
| `pregunta` | `TEXT` | `DEFAULT ''` | Pregunta que enfocó el diagrama |
| `archivos` | `JSONB` | `NOT NULL` | `[{ "name": "index.js", "content": "…" }]`: el código, para volver a abrirlo |
| `diagrama` | `JSONB` | `NOT NULL` | El mensaje `Diagram` del `.proto` en JSON (`toJson`) |
| `creado_en` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Orden del historial (más nuevos primero) |
| `actualizado_en` | `TIMESTAMPTZ` | `DEFAULT NOW()` | Reservado para cuando se pueda editar un guardado |

Índice: `diagramas_usuario_id_idx` sobre `(usuario_id, creado_en DESC)`, que es exactamente el filtro y el orden del historial.

Las fechas son `TIMESTAMPTZ`: con `TIMESTAMP` sin zona, `pg` las leía en la hora local del servidor y el historial mostraba 5 horas de diferencia. `schema.sql` convierte a `TIMESTAMPTZ` las bases creadas antes con `TIMESTAMP`.

### La tabla `items`

Era el CRUD de ejemplo. La API ya no la usa y `schema.sql` ya no la crea, pero **no la borra** para no perder datos de bases existentes. Si quieres eliminarla en tu base: `DROP TABLE IF EXISTS items;`.

## Relaciones

- `usuarios 1 ── N diagramas` por `diagramas.usuario_id`.
- Borrar un usuario borra sus diagramas (`ON DELETE CASCADE`).

## Consultas que hace la API

| Operación | SQL |
|---|---|
| Registro | `INSERT INTO usuarios (nombre, email, password_hash, proveedor) VALUES ($1, $2, $3, 'local') RETURNING …` |
| Login | `SELECT …, password_hash FROM usuarios WHERE email = $1` |
| Validar token | `SELECT … FROM usuarios WHERE id = $1` (en cada petición protegida, REST o gRPC) |
| Guardar diagrama | `INSERT INTO diagramas (usuario_id, titulo, tipo, pregunta, archivos, diagrama) VALUES ($1, …, $6) RETURNING …` |
| Historial | `SELECT id, titulo, tipo, pregunta, diagrama, creado_en FROM diagramas WHERE usuario_id = $1 ORDER BY creado_en DESC, id DESC` |
| Abrir diagrama | `SELECT … FROM diagramas WHERE usuario_id = $1 AND id = $2` |
| Borrar diagrama | `DELETE FROM diagramas WHERE usuario_id = $1 AND id = $2` |
| Salud | `SELECT 1` |

Todas son consultas parametrizadas (`$1`, `$2`…), así que no hay inyección SQL.

Las consultas de `diagramas` viven en `src/diagramas/repositorio.js` y todas filtran por `usuario_id`: un diagrama ajeno responde `not_found`, igual que uno inexistente.

## Conexión

`src/db.js` crea un `pg.Pool` con `DATABASE_URL`, SSL activado salvo que `DB_SSL=false` y un tiempo máximo de conexión de 5 s. Un error en una conexión inactiva se registra sin tumbar el servidor.
