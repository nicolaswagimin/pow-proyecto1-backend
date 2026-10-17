import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { indiceDelCodigo, miembrosSinRespaldo, nodosSinRespaldo, palabras } from '../src/diagramas/verificar.js';

// Código real con el que el usuario encontró el nodo inventado "Base de Datos [SQL]".
const python = [{ name: 'index.js', content: fs.readFileSync(new URL('./fixtures/simulador-combate.py', import.meta.url), 'utf8') }];

const nodo = (id, nombre, extra = {}) => ({ id, nombre, categoria: 'componente', tecnologia: '', ...extra });

// El diagrama que devolvió Gemini (nodos tal como quedaron guardados).
const delUsuario = {
  tipo: 'arquitectura',
  nodos: [
    nodo('estadisticas', 'Estadisticas', { tecnologia: 'Python' }),
    nodo('efecto-estado', 'EfectoEstado y Quemadura', { tecnologia: 'Python' }),
    nodo('arma', 'Arma', { tecnologia: 'Python' }),
    nodo('personaje', 'Personaje (Guerrero, Mago, Picaro)', { tecnologia: 'Python' }),
    nodo('bitacora-combate', 'BitacoraCombate', { tecnologia: 'Python' }),
    nodo('gestor-turnos', 'GestorTurnos', { tecnologia: 'Python' }),
    nodo('arena', 'Arena', { categoria: 'contenedor', tecnologia: 'Python' }),
    nodo('base-datos', 'Base de Datos', { categoria: 'base-datos', tecnologia: 'SQL' }),
  ],
};

test('palabras separa camelCase, snake_case y quita tildes y palabras vacías', () => {
  assert.deepEqual(palabras('EfectoEstado y Quemadura'), ['efecto', 'estado', 'quemadura']);
  assert.deepEqual(palabras('calcular_danio_extra'), ['calcular', 'danio', 'extra']);
  assert.deepEqual(palabras('Estadísticas de la API'), ['estadisticas', 'api']);
});

test('el índice ignora comentarios y docstrings', () => {
  const indice = indiceDelCodigo([{ name: 'a.py', content: '# base de datos\n"""usa SQL"""\nx = 1' }]);
  assert.equal(indice.has('datos'), false);
  assert.equal(indice.has('sql'), false);
  assert.equal(indice.has('x'), true);
});

test('detecta el nodo "Base de Datos" inventado en el simulador de combate', () => {
  assert.deepEqual(nodosSinRespaldo(delUsuario, python), [{ id: 'base-datos', nombre: 'Base de Datos' }]);
});

test('una base de datos real en JavaScript con pg no se marca', () => {
  const js = [{ name: 'index.js', content: "import pg from 'pg';\nconst db = new pg.Pool();\ndb.query('SELECT * FROM usuarios');" }];
  const diagrama = {
    nodos: [
      nodo('db', 'Base de Datos', { categoria: 'base-datos', tecnologia: 'PostgreSQL' }),
      nodo('postgres', 'PostgreSQL', { categoria: 'base-datos' }),
    ],
  };
  assert.deepEqual(nodosSinRespaldo(diagrama, js), []);
});

test('las personas no se verifican: son actores, no código', () => {
  const diagrama = { nodos: [nodo('usuario', 'Usuario del navegador', { categoria: 'persona' })] };
  assert.deepEqual(nodosSinRespaldo(diagrama, python), []);
});

test('un servicio externo que el código no usa se marca', () => {
  const diagrama = { nodos: [nodo('redis', 'Caché', { categoria: 'externo', tecnologia: 'Redis' })] };
  assert.deepEqual(nodosSinRespaldo(diagrama, python), [{ id: 'redis', nombre: 'Caché' }]);
});

test('miembros que no aparecen en el código', () => {
  const diagrama = {
    nodos: [
      nodo('arma', 'Arma', {
        atributos: [{ nombre: 'bonus_ataque', tipo: 'int' }, { nombre: 'durabilidad', tipo: 'int' }],
        metodos: [{ nombre: 'calcular_danio_extra', parametros: [] }, { nombre: 'reparar', parametros: [] }],
      }),
    ],
  };
  assert.deepEqual(miembrosSinRespaldo(diagrama, python), [
    { nodo: 'arma', tipo: 'atributo', nombre: 'durabilidad' },
    { nodo: 'arma', tipo: 'metodo', nombre: 'reparar' },
  ]);
});
