import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Code, ConnectError, createContextValues } from '@connectrpc/connect';
import { interceptorAuth, interceptorLimite } from '../src/grpc/interceptores.js';
import { USUARIO } from '../src/grpc/contexto.js';
import { crearLimitador } from '../src/limitador.js';

function peticion({ authorization, metodo = 'GenerateDiagram' } = {}) {
  const header = new Headers();
  if (authorization) header.set('authorization', authorization);
  return { header, method: { name: metodo }, contextValues: createContextValues() };
}

const siguiente = async (req) => ({ usuario: req.contextValues.get(USUARIO) });

async function codigoDe(promesa) {
  try {
    await promesa;
  } catch (err) {
    assert.ok(err instanceof ConnectError);
    return err.code;
  }
  assert.fail('se esperaba un error');
}

const verificar = async (token) => (token === 'bueno' ? { id: 7, nombre: 'Ana' } : null);

test('sin token → Unauthenticated', async () => {
  const llamada = interceptorAuth({ verificar })(siguiente)(peticion());
  assert.equal(await codigoDe(llamada), Code.Unauthenticated);
});

test('token inválido → Unauthenticated', async () => {
  const llamada = interceptorAuth({ verificar })(siguiente)(peticion({ authorization: 'Bearer malo' }));
  assert.equal(await codigoDe(llamada), Code.Unauthenticated);
});

test('token válido deja el usuario en el contexto', async () => {
  const respuesta = await interceptorAuth({ verificar })(siguiente)(
    peticion({ authorization: 'Bearer bueno' }),
  );
  assert.equal(respuesta.usuario.id, 7);
});

test('base de datos caída → Unavailable', async () => {
  const fallar = async () => {
    throw new Error('ECONNREFUSED');
  };
  const llamada = interceptorAuth({ verificar: fallar })(siguiente)(
    peticion({ authorization: 'Bearer bueno' }),
  );
  assert.equal(await codigoDe(llamada), Code.Unavailable);
});

function conUsuario(metodo) {
  const req = peticion({ metodo });
  req.contextValues.set(USUARIO, { id: 7 });
  return req;
}

test('límite solo aplica a Generate y Stream', async () => {
  const limitador = crearLimitador({ limite: 1, ventanaMs: 60_000 });
  const llamar = interceptorLimite({ limitador })(siguiente);
  await llamar(conUsuario('ListDiagrams'));
  await llamar(conUsuario('ListDiagrams'));
  await llamar(conUsuario('StreamDiagram'));
  assert.equal(await codigoDe(llamar(conUsuario('GenerateDiagram'))), Code.ResourceExhausted);
});

test('excedido → ResourceExhausted con mensaje claro', async () => {
  const limitador = crearLimitador({ limite: 0, ventanaMs: 60_000 });
  await assert.rejects(interceptorLimite({ limitador })(siguiente)(conUsuario('GenerateDiagram')), (err) => {
    assert.equal(err.code, Code.ResourceExhausted);
    assert.match(err.rawMessage, /Espera unos minutos/);
    return true;
  });
});
