import { pool } from '../db.js';

// Acceso a la tabla diagramas. Todas las consultas filtran por usuario_id: nadie puede leer ni
// borrar diagramas de otra persona.

const COLUMNAS = 'id, titulo, tipo, pregunta, archivos, diagrama, creado_en';

export async function guardar(usuarioId, { titulo, tipo, pregunta, archivos, diagrama }) {
  const { rows } = await pool.query(
    `INSERT INTO diagramas (usuario_id, titulo, tipo, pregunta, archivos, diagrama)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING ${COLUMNAS}`,
    [usuarioId, titulo, tipo, pregunta, JSON.stringify(archivos), JSON.stringify(diagrama)],
  );
  return rows[0];
}

// Historial del usuario, del más reciente al más antiguo. No trae el código (puede ser grande).
export async function listar(usuarioId) {
  const { rows } = await pool.query(
    `SELECT id, titulo, tipo, pregunta, diagrama, creado_en FROM diagramas
     WHERE usuario_id = $1 ORDER BY creado_en DESC, id DESC`,
    [usuarioId],
  );
  return rows;
}

export async function obtener(usuarioId, id) {
  const { rows } = await pool.query(
    `SELECT ${COLUMNAS} FROM diagramas WHERE usuario_id = $1 AND id = $2`,
    [usuarioId, id],
  );
  return rows[0] ?? null;
}
