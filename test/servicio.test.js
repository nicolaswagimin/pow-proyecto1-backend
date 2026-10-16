import { test } from 'node:test';
import assert from 'node:assert/strict';
import { create, toJson } from '@bufbuild/protobuf';
import { Code, ConnectError, createContextValues } from '@connectrpc/connect';
import {
  ChangeKind,
  DiagramSchema,
  DiagramType,
  NodeCategory,
  ProgressStage,
} from '../src/gen/codetodiagram/v1/diagram_pb.js';
import { validarEntrada } from '../src/diagramas/entrada.js';
import { USUARIO } from '../src/grpc/contexto.js';
import { crearServicioDiagramas } from '../src/grpc/servicio.js';

const archivos = [{ name: 'index.js', content: 'const app = express();' }];

function diagrama(nodos = ['web', 'api']) {
  return create(DiagramSchema, {
    type: DiagramType.ARCHITECTURE,
    title: 'API',
    nodes: nodos.map((id) => ({ id, name: id, category: NodeCategory.CONTAINER })),
    edges: [{ id: 'c1', from: 'web', to: 'api', label: 'GET' }],
  });
}

function contexto(usuarioId = 1) {
  const values = createContextValues();
  values.set(USUARIO, { id: usuarioId });
  return { values, signal: new AbortController().signal };
}

async function codigoDe(promesa) {
  try {
    await promesa;
  } catch (err) {
    assert.ok(err instanceof ConnectError, String(err));
    return err.code;
  }
  assert.fail('se esperaba un error');
}

function mensajeDe(fn) {
  try {
    fn();
  } catch (err) {
    assert.equal(err.code, Code.InvalidArgument);
    return err.rawMessage;
  }
  assert.fail('se esperaba un error');
}

// ---------- validarEntrada ----------

const entrada = { files: archivos, type: DiagramType.ARCHITECTURE, question: '' };

test('validarEntrada acepta una entrada normal', () => {
  validarEntrada(entrada);
});

test('validarEntrada exige al menos un archivo', () => {
  assert.equal(mensajeDe(() => validarEntrada({ ...entrada, files: [] })), 'Agrega al menos un archivo.');
});

test('validarEntrada admite máximo 10 archivos', () => {
  const files = Array.from({ length: 11 }, (_, i) => ({ name: `a${i}.js`, content: 'x' }));
  assert.equal(mensajeDe(() => validarEntrada({ ...entrada, files })), 'Máximo 10 archivos.');
});

test('validarEntrada limita el código a 60 000 caracteres', () => {
  const files = [{ name: 'a.js', content: 'x'.repeat(60_001) }];
  assert.equal(
    mensajeDe(() => validarEntrada({ ...entrada, files })),
    'El código supera los 60 000 caracteres.',
  );
});

test('validarEntrada rechaza código vacío', () => {
  const files = [{ name: 'a.js', content: '  \n ' }, { name: 'b.js', content: '' }];
  assert.equal(
    mensajeDe(() => validarEntrada({ ...entrada, files })),
    'Pega algo de código antes de generar.',
  );
});

test('validarEntrada exige nombre de archivo', () => {
  const files = [{ name: '  ', content: 'x' }];
  assert.equal(mensajeDe(() => validarEntrada({ ...entrada, files })), 'Cada archivo necesita un nombre.');
});

test('validarEntrada exige tipo', () => {
  assert.equal(
    mensajeDe(() => validarEntrada({ ...entrada, type: DiagramType.UNSPECIFIED })),
    'Elige un tipo de diagrama.',
  );
});

test('validarEntrada limita la pregunta a 300 caracteres', () => {
  assert.equal(
    mensajeDe(() => validarEntrada({ ...entrada, question: 'x'.repeat(301) })),
    'La pregunta admite hasta 300 caracteres.',
  );
});

// ---------- Servicio ----------

function repoFalso() {
  const filas = [];
  return {
    filas,
    async guardar(usuarioId, datos) {
      const fila = { id: filas.length + 1, usuario_id: usuarioId, creado_en: new Date('2026-10-15T10:00:00Z'), ...datos };
      filas.push(fila);
      return fila;
    },
    async listar(usuarioId) {
      return filas.filter((f) => f.usuario_id === usuarioId);
    },
    async obtener(usuarioId, id) {
      return filas.find((f) => f.usuario_id === usuarioId && f.id === id) ?? null;
    },
    async eliminar(usuarioId, id) {
      const i = filas.findIndex((f) => f.usuario_id === usuarioId && f.id === id);
      if (i === -1) return false;
      filas.splice(i, 1);
      return true;
    },
  };
}

function generarFalso(resultado) {
  return async (_entrada, { alProgreso = () => {} } = {}) => {
    alProgreso(ProgressStage.ANALYZING);
    alProgreso(ProgressStage.VALIDATING);
    return resultado;
  };
}

async function recoger(iterable) {
  const eventos = [];
  for await (const evento of iterable) eventos.push(evento);
  return eventos;
}

test('generate devuelve el diagrama', async () => {
  const servicio = crearServicioDiagramas({ generar: generarFalso(diagrama()), repo: repoFalso() });
  const respuesta = await servicio.generateDiagram(entrada, contexto());
  assert.equal(respuesta.diagram.nodes.length, 2);
});

test('generate rechaza entrada inválida', async () => {
  const servicio = crearServicioDiagramas({ generar: generarFalso(diagrama()), repo: repoFalso() });
  assert.equal(await codigoDe(servicio.generateDiagram({ ...entrada, files: [] }, contexto())), Code.InvalidArgument);
});

test('stream emite progreso, diagrama y diff en ese orden', async () => {
  const servicio = crearServicioDiagramas({ generar: generarFalso(diagrama(['web', 'api', 'db'])), repo: repoFalso() });
  const eventos = await recoger(servicio.streamDiagram({ ...entrada, previous: diagrama() }, contexto()));
  assert.deepEqual(
    eventos.map((e) => e.event.case),
    ['progress', 'progress', 'diagram', 'diff', 'progress'],
  );
  assert.equal(eventos[0].event.value.stage, ProgressStage.ANALYZING);
  assert.ok(eventos[0].event.value.message.length > 0);
  assert.deepEqual(eventos[3].event.value.nodes.map((c) => [c.id, c.kind]), [['db', ChangeKind.ADDED]]);
  assert.equal(eventos[4].event.value.stage, ProgressStage.DONE);
});

test('stream descarta un previous inválido en vez de mandarlo a Gemini', async () => {
  let recibido = 'sin llamar';
  const generar = async (e) => {
    recibido = e.anterior;
    return diagrama();
  };
  const roto = diagrama(Array.from({ length: 20 }, (_, i) => `n${i}`));
  const servicio = crearServicioDiagramas({ generar, repo: repoFalso() });
  const eventos = await recoger(servicio.streamDiagram({ ...entrada, previous: roto }, contexto()));
  assert.equal(recibido, undefined);
  assert.ok(!eventos.some((e) => e.event.case === 'diff'));
});

test('stream sin previous no emite diff', async () => {
  const servicio = crearServicioDiagramas({ generar: generarFalso(diagrama()), repo: repoFalso() });
  const eventos = await recoger(servicio.streamDiagram(entrada, contexto()));
  assert.ok(!eventos.some((e) => e.event.case === 'diff'));
});

test('stream propaga el error de la IA', async () => {
  const generar = async () => {
    throw new ConnectError('La IA devolvió un diagrama inválido dos veces.', Code.Internal);
  };
  const servicio = crearServicioDiagramas({ generar, repo: repoFalso() });
  assert.equal(await codigoDe(recoger(servicio.streamDiagram(entrada, contexto()))), Code.Internal);
});

test('save guarda y devuelve el resumen', async () => {
  const repo = repoFalso();
  const servicio = crearServicioDiagramas({ generar: generarFalso(diagrama()), repo });
  const { diagram } = await servicio.saveDiagram(
    { title: '', question: '¿Qué expone?', files: archivos, diagram: diagrama() },
    contexto(),
  );
  assert.equal(diagram.id, 1);
  assert.equal(diagram.title, 'API');
  assert.equal(diagram.nodeCount, 2);
  assert.equal(repo.filas[0].tipo, 'arquitectura');
});

test('save rechaza diagrama inválido', async () => {
  const roto = diagrama();
  roto.edges.push({ id: 'c2', from: 'api', to: 'fantasma', label: '', order: 0 });
  const servicio = crearServicioDiagramas({ generar: generarFalso(diagrama()), repo: repoFalso() });
  assert.equal(
    await codigoDe(servicio.saveDiagram({ title: 'x', files: archivos, diagram: roto }, contexto())),
    Code.InvalidArgument,
  );
});

test('list mapea node_count y fecha', async () => {
  const repo = repoFalso();
  await repo.guardar(1, { titulo: 'A', tipo: 'secuencia', pregunta: '', archivos, diagrama: toJson(DiagramSchema, diagrama()) });
  const servicio = crearServicioDiagramas({ generar: generarFalso(diagrama()), repo });
  const { diagrams } = await servicio.listDiagrams({}, contexto());
  assert.equal(diagrams[0].nodeCount, 2);
  assert.equal(diagrams[0].type, DiagramType.SEQUENCE);
  assert.equal(diagrams[0].createdAt.seconds, BigInt(Date.parse('2026-10-15T10:00:00Z') / 1000));
});

test('get devuelve archivos y diagrama', async () => {
  const repo = repoFalso();
  await repo.guardar(1, { titulo: 'A', tipo: 'arquitectura', pregunta: 'p', archivos, diagrama: toJson(DiagramSchema, diagrama()) });
  const servicio = crearServicioDiagramas({ generar: generarFalso(diagrama()), repo });
  const { diagram } = await servicio.getDiagram({ id: 1 }, contexto());
  assert.equal(diagram.files[0].name, 'index.js');
  assert.equal(diagram.diagram.edges[0].from, 'web');
});

test('get ajeno → NotFound', async () => {
  const repo = repoFalso();
  await repo.guardar(2, { titulo: 'A', tipo: 'arquitectura', pregunta: '', archivos, diagrama: toJson(DiagramSchema, diagrama()) });
  const servicio = crearServicioDiagramas({ generar: generarFalso(diagrama()), repo });
  assert.equal(await codigoDe(servicio.getDiagram({ id: 1 }, contexto(1))), Code.NotFound);
});

test('delete ajeno → NotFound', async () => {
  const repo = repoFalso();
  await repo.guardar(2, { titulo: 'A', tipo: 'arquitectura', pregunta: '', archivos, diagrama: toJson(DiagramSchema, diagrama()) });
  const servicio = crearServicioDiagramas({ generar: generarFalso(diagrama()), repo });
  assert.equal(await codigoDe(servicio.deleteDiagram({ id: 1 }, contexto(1))), Code.NotFound);
  assert.equal(repo.filas.length, 1);
});
