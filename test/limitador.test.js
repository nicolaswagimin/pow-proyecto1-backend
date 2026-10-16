import { test } from 'node:test';
import assert from 'node:assert/strict';
import { crearLimitador } from '../src/limitador.js';

function reloj() {
  let ahora = 0;
  return { ahora: () => ahora, avanzar: (ms) => (ahora += ms) };
}

test('permite hasta el límite', () => {
  const r = reloj();
  const limitador = crearLimitador({ limite: 3, ventanaMs: 1000, ahora: r.ahora });
  assert.deepEqual([1, 2, 3].map(() => limitador.consumir('a')), [true, true, true]);
});

test('bloquea al superar el límite', () => {
  const limitador = crearLimitador({ limite: 2, ventanaMs: 1000, ahora: reloj().ahora });
  limitador.consumir('a');
  limitador.consumir('a');
  assert.equal(limitador.consumir('a'), false);
});

test('cada clave tiene su propio cupo', () => {
  const limitador = crearLimitador({ limite: 1, ventanaMs: 1000, ahora: reloj().ahora });
  assert.equal(limitador.consumir('a'), true);
  assert.equal(limitador.consumir('b'), true);
});

test('libera al pasar la ventana', () => {
  const r = reloj();
  const limitador = crearLimitador({ limite: 1, ventanaMs: 1000, ahora: r.ahora });
  limitador.consumir('a');
  r.avanzar(999);
  assert.equal(limitador.consumir('a'), false);
  r.avanzar(2);
  assert.equal(limitador.consumir('a'), true);
});
