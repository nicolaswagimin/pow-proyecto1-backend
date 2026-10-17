// Verifica que lo que dibuja la IA exista en el código. Es una heurística: un nodo está respaldado
// si todas las palabras significativas de su nombre, de su id o de su tecnología aparecen en el
// código (identificadores y textos, sin comentarios ni docstrings). Las personas quedan exentas:
// son actores, no código. Ver docs/ia.md.

const VACIAS = new Set(
  'de del la las el los y e o u con para por en a al un una unos unas se the of and or for to with in on'.split(' '),
);

// Lenguajes y entornos: decir "Python" no prueba que un nodo exista en un código Python.
const GENERICAS = new Set(
  'python javascript js node nodejs typescript ts java go golang csharp c php ruby html css'.split(' '),
);

// Cómo aparece en el código una tecnología que se suele nombrar distinto.
const ALIAS = {
  postgresql: ['pg', 'postgres', 'psycopg', 'psycopg2', 'sequelize', 'prisma'],
  postgres: ['pg', 'postgresql', 'psycopg', 'psycopg2'],
  mysql: ['mysql2', 'pymysql'],
  mongodb: ['mongo', 'mongoose', 'pymongo'],
  mongo: ['mongodb', 'mongoose', 'pymongo'],
  sqlite: ['sqlite3'],
  sql: ['select', 'insert'],
  redis: ['ioredis'],
};

export function palabras(texto) {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p && !VACIAS.has(p));
}

function sinComentarios(codigo) {
  return codigo
    .replace(/"""[\s\S]*?"""|'''[\s\S]*?'''/g, ' ') // docstrings de Python
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // /* … */
    .replace(/(^|[^:])\/\/.*$/gm, '$1') // // … (sin cortar URLs como http://)
    .replace(/(^|\s)#.*$/gm, '$1'); // # … (Python, Ruby, shell)
}

// Conjunto de palabras del código de todos los archivos.
export function indiceDelCodigo(archivos) {
  return new Set(archivos.flatMap((archivo) => palabras(sinComentarios(archivo.content))));
}

function aparece(palabra, indice) {
  return indice.has(palabra) || (ALIAS[palabra] ?? []).some((alias) => indice.has(alias));
}

function respaldado(texto, indice, { quitarGenericas = false } = {}) {
  const lista = palabras(texto).filter((p) => !quitarGenericas || !GENERICAS.has(p));
  return lista.length > 0 && lista.every((p) => aparece(p, indice));
}

// Nodos (del JSON de Gemini) que no aparecen en el código: [{ id, nombre }].
export function nodosSinRespaldo(diagrama, archivos) {
  const indice = indiceDelCodigo(archivos);
  return diagrama.nodos
    .filter((nodo) => nodo.categoria !== 'persona')
    .filter(
      (nodo) =>
        !respaldado(nodo.nombre, indice) &&
        !respaldado(nodo.id, indice) &&
        !respaldado(nodo.tecnologia ?? '', indice, { quitarGenericas: true }),
    )
    .map(({ id, nombre }) => ({ id, nombre }));
}
