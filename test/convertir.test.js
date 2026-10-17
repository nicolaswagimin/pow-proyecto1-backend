import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DiagramType, NodeCategory } from '../src/gen/codetodiagram/v1/diagram_pb.js';
import { jsonAProto, protoAJson } from '../src/diagramas/convertir.js';
import { validarDiagrama } from '../src/diagramas/validar.js';

const json = validarDiagrama({
  tipo: 'secuencia',
  titulo: 'Login',
  descripcion: 'Pasos del inicio de sesión.',
  nodos: [
    { id: 'usuario', nombre: 'Usuario', categoria: 'persona' },
    { id: 'api', nombre: 'API', categoria: 'contenedor', tecnologia: 'Express', archivo: 'src/index.js' },
    { id: 'db', nombre: 'BD', categoria: 'base-datos', tecnologia: 'PostgreSQL' },
  ],
  conexiones: [
    { id: 'c1', de: 'usuario', a: 'api', etiqueta: 'POST /login', orden: 1 },
    { id: 'c2', de: 'api', a: 'db', etiqueta: 'SELECT', orden: 2 },
  ],
}).diagrama;

test('convierte tipos y categorías a los enums del proto', () => {
  const proto = jsonAProto(json);
  assert.equal(proto.type, DiagramType.SEQUENCE);
  assert.equal(proto.nodes[0].category, NodeCategory.PERSON);
  assert.equal(proto.nodes[2].category, NodeCategory.DATABASE);
  assert.equal(proto.edges[1].from, 'api');
  assert.equal(proto.edges[1].order, 2);
});

test('ida y vuelta conserva el diagrama', () => {
  assert.deepEqual(protoAJson(jsonAProto(json)), json);
});

test('en arquitectura no incluye orden al volver a JSON', () => {
  const arq = { ...json, tipo: 'arquitectura', conexiones: json.conexiones.map(({ orden, ...c }) => c) };
  const vuelta = protoAJson(jsonAProto(arq));
  assert.equal('orden' in vuelta.conexiones[0], false);
});

test('ida y vuelta de un diagrama de clases conserva atributos y métodos', () => {
  const clases = validarDiagrama({
    tipo: 'clases',
    titulo: 'Armas',
    nodos: [
      {
        id: 'arma',
        nombre: 'Arma',
        categoria: 'componente',
        atributos: [{ nombre: 'bonus_ataque', tipo: 'int' }],
        metodos: [{ nombre: 'calcular_danio_extra', parametros: [{ nombre: 'turno', tipo: 'int' }], retorno: 'int' }],
      },
    ],
  }).diagrama;
  const proto = jsonAProto(clases);
  assert.equal(proto.type, DiagramType.CLASS);
  assert.equal(proto.nodes[0].methods[0].returnType, 'int');
  assert.equal(proto.nodes[0].methods[0].parameters[0].name, 'turno');
  assert.deepEqual(protoAJson(proto), clases);
});
