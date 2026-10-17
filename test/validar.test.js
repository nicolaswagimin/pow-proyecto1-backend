import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validarDiagrama } from '../src/diagramas/validar.js';

function arquitectura(cambios = {}) {
  return {
    tipo: 'arquitectura',
    titulo: 'Login',
    descripcion: 'Cómo inicia sesión un usuario.',
    nodos: [
      { id: 'web', nombre: 'Frontend', categoria: 'contenedor', tecnologia: 'Angular' },
      { id: 'api', nombre: 'API REST', categoria: 'contenedor', tecnologia: 'Express' },
      { id: 'db', nombre: 'Base de datos', categoria: 'base-datos', tecnologia: 'PostgreSQL' },
    ],
    conexiones: [
      { id: 'c1', de: 'web', a: 'api', etiqueta: 'POST /login' },
      { id: 'c2', de: 'api', a: 'db', etiqueta: 'SELECT usuario' },
    ],
    ...cambios,
  };
}

function errores(valor) {
  const resultado = validarDiagrama(valor);
  assert.equal(resultado.ok, false);
  return resultado.errores;
}

test('acepta un diagrama válido de arquitectura', () => {
  const resultado = validarDiagrama(arquitectura());
  assert.equal(resultado.ok, true);
  assert.equal(resultado.diagrama.nodos.length, 3);
});

test('acepta secuencia con orden', () => {
  const d = arquitectura({ tipo: 'secuencia' });
  d.conexiones = d.conexiones.map((c, i) => ({ ...c, orden: i + 1 }));
  assert.equal(validarDiagrama(d).ok, true);
});

test('rechaza más de 12 nodos', () => {
  const nodos = Array.from({ length: 13 }, (_, i) => ({
    id: `n${i}`,
    nombre: `Nodo ${i}`,
    categoria: 'componente',
  }));
  const lista = errores(arquitectura({ nodos, conexiones: [] }));
  assert.ok(lista.some((e) => /máximo 12 nodos/.test(e)), lista.join('\n'));
});

test('rechaza un diagrama sin nodos', () => {
  const lista = errores(arquitectura({ nodos: [], conexiones: [] }));
  assert.ok(lista.some((e) => /al menos un nodo/.test(e)), lista.join('\n'));
});

test('rechaza ids duplicados', () => {
  const d = arquitectura();
  d.nodos[2] = { ...d.nodos[2], id: 'api' };
  d.conexiones = [];
  assert.ok(errores(d).includes('El id "api" está repetido.'));
});

test('rechaza id con mayúsculas', () => {
  const d = arquitectura({ conexiones: [] });
  d.nodos[0] = { ...d.nodos[0], id: 'Web' };
  assert.ok(errores(d).includes('El id "Web" solo puede tener minúsculas, números y guiones.'));
});

test('rechaza conexión a nodo inexistente', () => {
  const d = arquitectura();
  d.nodos = d.nodos.slice(0, 2);
  d.conexiones.push({ id: 'c3', de: 'api', a: 'db' });
  d.conexiones.splice(1, 1);
  assert.deepEqual(errores(d), ['La conexión "c3" apunta a un nodo que no existe: "db"']);
});

test('rechaza ids de conexión repetidos', () => {
  const d = arquitectura();
  d.conexiones[1] = { ...d.conexiones[1], id: 'c1' };
  assert.ok(errores(d).includes('El id "c1" está repetido.'));
});

test('rechaza autoconexión', () => {
  const d = arquitectura();
  d.conexiones.push({ id: 'c3', de: 'api', a: 'api' });
  assert.ok(errores(d).includes('La conexión "c3" une el nodo "api" consigo mismo.'));
});

test('rechaza categoría desconocida', () => {
  const d = arquitectura();
  d.nodos[1] = { ...d.nodos[1], categoria: 'servicio' };
  assert.ok(errores(d).includes('El nodo "api" tiene una categoría desconocida: "servicio".'));
});

test('rechaza tipo desconocido', () => {
  assert.ok(errores(arquitectura({ tipo: 'flujo' })).includes('Tipo de diagrama desconocido: "flujo".'));
});

test('rechaza secuencia sin orden', () => {
  const d = arquitectura({ tipo: 'secuencia' });
  d.conexiones[0] = { ...d.conexiones[0], orden: 1 };
  assert.ok(
    errores(d).includes('En un diagrama de secuencia, la conexión "c2" necesita un orden (1 o más).'),
  );
});

test('rechaza nodo sin nombre', () => {
  const d = arquitectura();
  d.nodos[0] = { ...d.nodos[0], nombre: '  ' };
  assert.ok(errores(d).some((e) => /nombre/.test(e)));
});

test('rechaza null y texto', () => {
  assert.deepEqual(errores(null), ['La respuesta no es un objeto JSON.']);
  assert.deepEqual(errores('hola'), ['La respuesta no es un objeto JSON.']);
});

// ---------- Diagrama de clases ----------

function clases(cambios = {}) {
  return {
    tipo: 'clases',
    titulo: 'Personajes',
    nodos: [
      {
        id: 'personaje',
        nombre: 'Personaje',
        categoria: 'componente',
        atributos: [{ nombre: 'nombre', tipo: 'str' }, { nombre: 'stats' }],
        metodos: [
          { nombre: 'ejecutar_turno', parametros: [{ nombre: 'objetivo', tipo: 'Personaje' }] },
          { nombre: 'procesar_turnos_estados', retorno: 'None' },
        ],
      },
      { id: 'guerrero', nombre: 'Guerrero', categoria: 'componente' },
    ],
    conexiones: [{ id: 'c1', de: 'guerrero', a: 'personaje', etiqueta: 'hereda' }],
    ...cambios,
  };
}

test('acepta un diagrama de clases con atributos y métodos', () => {
  const resultado = validarDiagrama(clases());
  assert.equal(resultado.ok, true);
  assert.equal(resultado.diagrama.nodos[0].atributos[1].tipo, '');
  assert.deepEqual(resultado.diagrama.nodos[1].metodos, []);
});

test('rechaza atributos o métodos fuera de un diagrama de clases', () => {
  assert.ok(
    errores(clases({ tipo: 'arquitectura' })).includes(
      'El nodo "personaje" tiene atributos o métodos, pero solo un diagrama de clases los muestra.',
    ),
  );
});

test('rechaza más de 12 atributos en una clase', () => {
  const d = clases();
  d.nodos[0].atributos = Array.from({ length: 13 }, (_, i) => ({ nombre: `a${i}` }));
  assert.ok(errores(d).includes('El nodo "personaje" tiene más de 12 atributos.'));
});

test('rechaza más de 12 métodos en una clase', () => {
  const d = clases();
  d.nodos[0].metodos = Array.from({ length: 13 }, (_, i) => ({ nombre: `m${i}` }));
  assert.ok(errores(d).includes('El nodo "personaje" tiene más de 12 métodos.'));
});

test('rechaza un método sin nombre', () => {
  const d = clases();
  d.nodos[0].metodos.push({ nombre: ' ' });
  assert.ok(errores(d).some((e) => /nombre/.test(e)));
});
