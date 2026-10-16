-- Esquema de la base de datos. Se ejecuta automáticamente al arrancar el backend
-- (iniciarDB en src/db.js), pero también puedes pegarlo en el editor SQL de Neon o Supabase.
-- Todas las sentencias son idempotentes: se pueden ejecutar varias veces sin romper nada.

-- Usuarios. google_id, avatar_url y proveedor quedan listos para el login con Google futuro.
CREATE TABLE IF NOT EXISTS usuarios (
  id            SERIAL PRIMARY KEY,
  nombre        VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NULL,
  google_id     VARCHAR(255) UNIQUE NULL,
  avatar_url    TEXT NULL,
  proveedor     VARCHAR(20) DEFAULT 'local',
  creado_en     TIMESTAMP DEFAULT NOW()
);

-- La tabla items del CRUD de ejemplo ya no se usa. No se borra aquí para no perder datos de
-- bases existentes; si quieres eliminarla: DROP TABLE IF EXISTS items;

-- Diagramas guardados por cada usuario (el historial). archivos y diagrama se guardan como JSONB:
-- archivos = [{ name, content }], diagrama = mensaje Diagram del .proto en formato JSON.
CREATE TABLE IF NOT EXISTS diagramas (
  id             SERIAL PRIMARY KEY,
  usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  titulo         VARCHAR(200) NOT NULL,
  tipo           VARCHAR(20) NOT NULL,
  pregunta       TEXT DEFAULT '',
  archivos       JSONB NOT NULL,
  diagrama       JSONB NOT NULL,
  creado_en      TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

-- Bases creadas con TIMESTAMP (sin zona): se convierten a TIMESTAMPTZ interpretando los valores
-- como UTC, que es como los guarda NOW() en Neon. Si ya son TIMESTAMPTZ, no hace nada.
DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
      WHERE table_name = 'diagramas' AND column_name = 'creado_en') = 'timestamp without time zone' THEN
    ALTER TABLE diagramas
      ALTER COLUMN creado_en TYPE TIMESTAMPTZ USING creado_en AT TIME ZONE 'UTC',
      ALTER COLUMN actualizado_en TYPE TIMESTAMPTZ USING actualizado_en AT TIME ZONE 'UTC';
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS diagramas_usuario_id_idx ON diagramas (usuario_id, creado_en DESC);
