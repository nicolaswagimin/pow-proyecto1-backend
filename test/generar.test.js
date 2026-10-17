import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Code, ConnectError } from '@connectrpc/connect';
import { create } from '@bufbuild/protobuf';
import {
  DiagramSchema,
  DiagramType,
  NodeCategory,
  ProgressStage,
} from '../src/gen/codetodiagram/v1/diagram_pb.js';
import { extraerJson, generarDiagrama } from '../src/diagramas/generar.js';
import { construirPrompt } from '../src/diagramas/prompt.js';
import { llamarGeminiJson } from '../src/ia.js';

// Todas las pruebas usan un Gemini falso: nunca se consume la cuota real.

// Código donde existen los nodos del diagrama válido (web y api).
const archivos = [{ name: 'index.js', content: "const web = cliente();\napp.get('/api/health', responder);" }];

const valido = JSON.stringify({
  tipo: 'arquitectura',
  titulo: 'API',
  descripcion: 'Qué expone la API.',
  nodos: [
    { id: 'web', nombre: 'Web', categoria: 'contenedor' },
    { id: 'api', nombre: 'API', categoria: 'contenedor', tecnologia: 'Express' },
  ],
  conexiones: [{ id: 'c1', de: 'web', a: 'api', etiqueta: 'GET /api/health' }],
});

const roto = JSON.stringify({
  tipo: 'arquitectura',
  titulo: 'API',
  nodos: [{ id: 'api', nombre: 'API', categoria: 'contenedor' }],
  conexiones: [{ id: 'c1', de: 'api', a: 'db' }],
});

function geminiFalso(respuestas) {
  const llamadas = [];
  const llamar = async (peticion) => {
    llamadas.push(peticion);
    return respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)];
  };
  return { llamar, llamadas };
}

const entrada = { archivos, tipo: DiagramType.ARCHITECTURE, pregunta: '' };

test('extraerJson quita cercas markdown', () => {
  assert.deepEqual(extraerJson('Aquí está:\n```json\n{"a": 1}\n```'), { a: 1 });
});

test('extraerJson lanza si no hay objeto', () => {
  assert.throws(() => extraerJson('no puedo ayudarte con eso'), /La IA no devolvió JSON/);
});

test('construirPrompt incluye archivos, tipo y pregunta', () => {
  const prompt = construirPrompt({ ...entrada, tipo: DiagramType.SEQUENCE, pregunta: '¿Cómo se valida el login?' });
  assert.match(prompt, /index\.js/);
  assert.match(prompt, /secuencia/);
  assert.match(prompt, /¿Cómo se valida el login\?/);
});

test('construirPrompt incluye los ids del diagrama anterior', () => {
  const anterior = create(DiagramSchema, {
    type: DiagramType.ARCHITECTURE,
    title: 'Antes',
    nodes: [{ id: 'servicio-pagos', name: 'Pagos', category: NodeCategory.COMPONENT }],
  });
  const prompt = construirPrompt({ ...entrada, anterior });
  assert.match(prompt, /"servicio-pagos"/);
  assert.match(prompt, /reutiliza/i);
});

test('devuelve el diagrama si la primera respuesta es válida', async () => {
  const { llamar, llamadas } = geminiFalso([valido]);
  const diagrama = await generarDiagrama(entrada, { llamar });
  assert.equal(llamadas.length, 1);
  assert.equal(diagrama.type, DiagramType.ARCHITECTURE);
  assert.deepEqual(diagrama.nodes.map((n) => n.id), ['web', 'api']);
});

test('reintenta una vez con los errores en el prompt', async () => {
  const { llamar, llamadas } = geminiFalso([roto, valido]);
  const diagrama = await generarDiagrama(entrada, { llamar });
  assert.equal(llamadas.length, 2);
  assert.match(llamadas[1].usuario, /apunta a un nodo que no existe/);
  assert.equal(diagrama.nodes.length, 2);
});

test('reintenta si la respuesta no es JSON', async () => {
  const { llamar, llamadas } = geminiFalso(['lo siento', valido]);
  await generarDiagrama(entrada, { llamar });
  assert.equal(llamadas.length, 2);
});

test('rechaza un diagrama de otro tipo que el pedido', async () => {
  const { llamar, llamadas } = geminiFalso([valido, valido]);
  await assert.rejects(
    generarDiagrama({ ...entrada, tipo: DiagramType.SEQUENCE }, { llamar }),
    (err) => err instanceof ConnectError && err.code === Code.Internal,
  );
  assert.match(llamadas[1].usuario, /secuencia/);
});

test('falla con Code.Internal tras dos respuestas inválidas', async () => {
  const { llamar, llamadas } = geminiFalso([roto, roto]);
  await assert.rejects(generarDiagrama(entrada, { llamar }), (err) => {
    assert.ok(err instanceof ConnectError);
    assert.equal(err.code, Code.Internal);
    assert.match(err.rawMessage, /dos veces/);
    return true;
  });
  assert.equal(llamadas.length, 2);
});

test('reporta las etapas de progreso en orden', async () => {
  const etapas = [];
  const { llamar } = geminiFalso([roto, valido]);
  await generarDiagrama(entrada, { llamar, alProgreso: (etapa) => etapas.push(etapa) });
  assert.deepEqual(etapas, [
    ProgressStage.ANALYZING,
    ProgressStage.VALIDATING,
    ProgressStage.RETRYING,
    ProgressStage.VALIDATING,
  ]);
});

test('llamarGeminiJson pide JSON y devuelve el texto', async () => {
  process.env.GEMINI_API_KEY = 'clave-de-prueba';
  let cuerpo;
  const fetchImpl = async (url, opciones) => {
    cuerpo = JSON.parse(opciones.body);
    assert.equal(opciones.headers['x-goog-api-key'], 'clave-de-prueba');
    return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }] }));
  };
  const texto = await llamarGeminiJson({ sistema: 'S', usuario: 'U', fetchImpl });
  assert.equal(texto, '{"a":1}');
  assert.equal(cuerpo.generationConfig.responseMimeType, 'application/json');
  assert.equal(cuerpo.contents[0].parts[0].text, 'U');
});

test('llamarGeminiJson sin API key falla con FailedPrecondition', async () => {
  const anterior = process.env.GEMINI_API_KEY;
  delete process.env.GEMINI_API_KEY;
  await assert.rejects(
    llamarGeminiJson({ sistema: 'S', usuario: 'U', fetchImpl: async () => assert.fail('no debe llamar') }),
    (err) => err.code === Code.FailedPrecondition,
  );
  process.env.GEMINI_API_KEY = anterior;
});

test('llamarGeminiJson con error HTTP falla con Unavailable', async () => {
  process.env.GEMINI_API_KEY = 'clave-de-prueba';
  const fetchImpl = async () =>
    new Response(JSON.stringify({ error: { message: 'cuota agotada' } }), { status: 429 });
  await assert.rejects(llamarGeminiJson({ sistema: 'S', usuario: 'U', fetchImpl }), (err) => {
    assert.equal(err.code, Code.Unavailable);
    assert.match(err.rawMessage, /cuota agotada/);
    return true;
  });
});

test('llamarGeminiJson corta si Gemini no responde a tiempo', async () => {
  process.env.GEMINI_API_KEY = 'clave-de-prueba';
  const fetchImpl = (url, { signal }) =>
    new Promise((_, rechazar) => signal.addEventListener('abort', () => rechazar(signal.reason)));
  await assert.rejects(llamarGeminiJson({ sistema: 'S', usuario: 'U', fetchImpl, tiempoMaximoMs: 20 }), (err) => {
    assert.equal(err.code, Code.Unavailable);
    assert.match(err.rawMessage, /tardó demasiado/);
    return true;
  });
});

// ---------- Fidelidad al código ----------

const conInventado = JSON.stringify({
  tipo: 'arquitectura',
  titulo: 'API',
  nodos: [
    { id: 'web', nombre: 'Web', categoria: 'contenedor' },
    { id: 'api', nombre: 'API', categoria: 'contenedor' },
    { id: 'base-datos', nombre: 'Base de Datos', categoria: 'base-datos', tecnologia: 'SQL' },
  ],
  conexiones: [
    { id: 'c1', de: 'web', a: 'api' },
    { id: 'c2', de: 'api', a: 'base-datos', etiqueta: 'persiste' },
  ],
});

test('reintenta pidiendo quitar un nodo que no aparece en el código', async () => {
  const { llamar, llamadas } = geminiFalso([conInventado, valido]);
  const diagrama = await generarDiagrama(entrada, { llamar });
  assert.equal(llamadas.length, 2);
  assert.match(llamadas[1].usuario, /"base-datos" \(Base de Datos\) no aparece en el código/);
  assert.deepEqual(diagrama.nodes.map((n) => n.id), ['web', 'api']);
});

test('si el nodo inventado sigue tras el reintento, se marca notInCode', async () => {
  const { llamar } = geminiFalso([conInventado, conInventado]);
  const diagrama = await generarDiagrama(entrada, { llamar });
  const marcados = diagrama.nodes.filter((n) => n.notInCode).map((n) => n.id);
  assert.deepEqual(marcados, ['base-datos']);
});

test('tras el reintento descarta atributos y métodos que no aparecen en el código', async () => {
  const conMiembros = JSON.stringify({
    tipo: 'clases',
    titulo: 'Web',
    nodos: [
      {
        id: 'web',
        nombre: 'Web',
        categoria: 'componente',
        atributos: [{ nombre: 'cliente' }, { nombre: 'sesion' }],
        metodos: [{ nombre: 'responder' }, { nombre: 'cerrar' }],
      },
    ],
  });
  const { llamar, llamadas } = geminiFalso([conMiembros, conMiembros]);
  const diagrama = await generarDiagrama({ ...entrada, tipo: DiagramType.CLASS }, { llamar });
  assert.match(llamadas[1].usuario, /atributo "sesion" de "web" no aparece en el código/);
  assert.deepEqual(diagrama.nodes[0].attributes.map((a) => a.name), ['cliente']);
  assert.deepEqual(diagrama.nodes[0].methods.map((m) => m.name), ['responder']);
});

const tituloQuePromete = JSON.stringify({ ...JSON.parse(valido), titulo: 'Arquitectura con Atributos y Métodos' });

test('un título que promete atributos en arquitectura provoca un reintento', async () => {
  const { llamar, llamadas } = geminiFalso([tituloQuePromete, valido]);
  const diagrama = await generarDiagrama(entrada, { llamar });
  assert.equal(llamadas.length, 2);
  assert.match(llamadas[1].usuario, /no los muestra/);
  assert.equal(diagrama.title, 'API');
});

test('si el título sigue prometiendo tras el reintento, se reemplaza por uno neutro', async () => {
  const { llamar } = geminiFalso([tituloQuePromete, tituloQuePromete]);
  const diagrama = await generarDiagrama(entrada, { llamar });
  assert.equal(diagrama.title, 'Diagrama de arquitectura');
});

test('en un diagrama de clases el título sí puede hablar de atributos y métodos', async () => {
  const clases = JSON.stringify({
    tipo: 'clases',
    titulo: 'Atributos y métodos de Web',
    nodos: [{ id: 'web', nombre: 'Web', categoria: 'componente', metodos: [{ nombre: 'responder' }] }],
  });
  const { llamar, llamadas } = geminiFalso([clases]);
  const diagrama = await generarDiagrama({ ...entrada, tipo: DiagramType.CLASS }, { llamar });
  assert.equal(llamadas.length, 1);
  assert.equal(diagrama.title, 'Atributos y métodos de Web');
});
