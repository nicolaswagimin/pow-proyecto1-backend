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

CREATE TABLE IF NOT EXISTS items (
  id          SERIAL PRIMARY KEY,
  titulo      VARCHAR(200) NOT NULL,
  descripcion TEXT DEFAULT '',
  creado_en   TIMESTAMP DEFAULT NOW()
);

-- Cada item pertenece a un usuario; si se borra el usuario, se borran sus items.
ALTER TABLE items ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS items_usuario_id_idx ON items (usuario_id);

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
  creado_en      TIMESTAMP DEFAULT NOW(),
  actualizado_en TIMESTAMP DEFAULT NOW()
);
