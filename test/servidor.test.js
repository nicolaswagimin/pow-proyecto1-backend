import { test } from 'node:test';
import assert from 'node:assert/strict';
import http2 from 'node:http2';
import { crearServidor } from '../src/servidor.js';

function levantar() {
  const servidor = crearServidor((req, res) => {
    res.setHeader('content-type', 'text/plain');
    res.end(`version ${req.httpVersion}`);
  });
  return new Promise((resolver) => servidor.listen(0, () => resolver(servidor)));
}

test('responde por HTTP/1.1', async (t) => {
  const servidor = await levantar();
  t.after(() => servidor.close());
  const respuesta = await fetch(`http://localhost:${servidor.address().port}/`);
  assert.equal(await respuesta.text(), 'version 1.1');
});

test('responde por HTTP/2 sin TLS', async (t) => {
  const servidor = await levantar();
  const cliente = http2.connect(`http://localhost:${servidor.address().port}`);
  t.after(() => {
    cliente.close();
    servidor.close();
  });
  const texto = await new Promise((resolver, rechazar) => {
    const peticion = cliente.request({ ':path': '/' });
    let cuerpo = '';
    peticion.setEncoding('utf8');
    peticion.on('data', (trozo) => (cuerpo += trozo));
    peticion.on('end', () => resolver(cuerpo));
    peticion.on('error', rechazar);
    peticion.end();
  });
  assert.equal(texto, 'version 2.0');
});
