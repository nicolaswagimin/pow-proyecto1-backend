import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { crearManejadorGrpc, MAX_BYTES_GRPC } from '../src/grpc/manejador.js';

test('rechaza cuerpos gRPC más grandes que el límite antes de autenticar', async (t) => {
  const servidor = http.createServer(crearManejadorGrpc({ impl: {}, fallback: (req, res) => res.end('rest') }));
  await new Promise((r) => servidor.listen(0, r));
  t.after(() => servidor.close());
  const respuesta = await fetch(
    `http://localhost:${servidor.address().port}/codetodiagram.v1.DiagramService/SaveDiagram`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'x'.repeat(MAX_BYTES_GRPC + 10) }),
    },
  );
  const cuerpo = await respuesta.json();
  assert.equal(cuerpo.code, 'resource_exhausted');
});
