import { test } from 'node:test';
import assert from 'node:assert/strict';
import { create } from '@bufbuild/protobuf';
import { ChangeKind, DiagramSchema, NodeCategory } from '../src/gen/codetodiagram/v1/diagram_pb.js';
import { calcularDiff } from '../src/diagramas/diff.js';

function diagrama({ nodos = ['web', 'api', 'db'], aristas = [['c1', 'web', 'api', 'login'], ['c2', 'api', 'db', 'consulta']] } = {}) {
  return create(DiagramSchema, {
    title: 'D',
    nodes: nodos.map((n) =>
      typeof n === 'string' ? { id: n, name: n, category: NodeCategory.CONTAINER } : n,
    ),
    edges: aristas.map(([id, from, to, label, order = 0]) => ({ id, from, to, label, order })),
  });
}

const resumen = (diff) => ({
  nodos: diff.nodes.map((c) => [c.id, c.kind]),
  aristas: diff.edges.map((c) => [c.id, c.kind]),
});

test('sin cambios da listas vacías', () => {
  assert.deepEqual(resumen(calcularDiff(diagrama(), diagrama())), { nodos: [], aristas: [] });
});

test('nodo agregado', () => {
  const despues = diagrama({ nodos: ['web', 'api', 'db', 'cache'] });
  assert.deepEqual(resumen(calcularDiff(diagrama(), despues)).nodos, [['cache', ChangeKind.ADDED]]);
});

test('nodo eliminado', () => {
  const despues = diagrama({ nodos: ['web', 'api'], aristas: [['c1', 'web', 'api', 'login']] });
  const r = resumen(calcularDiff(diagrama(), despues));
  assert.deepEqual(r.nodos, [['db', ChangeKind.REMOVED]]);
  assert.deepEqual(r.aristas, [['c2', ChangeKind.REMOVED]]);
});

test('nodo modificado por tecnología', () => {
  const despues = diagrama();
  despues.nodes[1].technology = 'Fastify';
  assert.deepEqual(resumen(calcularDiff(diagrama(), despues)).nodos, [['api', ChangeKind.MODIFIED]]);
});

test('conexión renumerada (c1→c7) con mismos extremos y etiqueta no cuenta como cambio', () => {
  const despues = diagrama({ aristas: [['c7', 'web', 'api', 'login'], ['c2', 'api', 'db', 'consulta']] });
  assert.deepEqual(resumen(calcularDiff(diagrama(), despues)).aristas, []);
});

test('conexión con nueva etiqueta es modificada', () => {
  const despues = diagrama({ aristas: [['c1', 'web', 'api', 'POST /login'], ['c2', 'api', 'db', 'consulta']] });
  assert.deepEqual(resumen(calcularDiff(diagrama(), despues)).aristas, [['c1', ChangeKind.MODIFIED]]);
});

test('conexión con nuevo orden es modificada', () => {
  const antes = diagrama({ aristas: [['c1', 'web', 'api', 'login', 1]] });
  const despues = diagrama({ aristas: [['c1', 'web', 'api', 'login', 2]] });
  assert.deepEqual(resumen(calcularDiff(antes, despues)).aristas, [['c1', ChangeKind.MODIFIED]]);
});

test('mismo id con otros extremos cuenta como eliminada y agregada', () => {
  const despues = diagrama({ aristas: [['c1', 'web', 'db', 'login'], ['c2', 'api', 'db', 'consulta']] });
  assert.deepEqual(resumen(calcularDiff(diagrama(), despues)).aristas, [
    ['c1', ChangeKind.ADDED],
    ['c1', ChangeKind.REMOVED],
  ]);
});

test('resultado ordenado por id', () => {
  const despues = diagrama({ nodos: ['zeta', 'web', 'api', 'db', 'alfa'] });
  assert.deepEqual(
    resumen(calcularDiff(diagrama(), despues)).nodos.map(([id]) => id),
    ['alfa', 'zeta'],
  );
});
