import http from 'node:http';
import http2 from 'node:http2';
import net from 'node:net';

// Un solo puerto para HTTP/1.1 y HTTP/2 sin TLS (h2c). Se mira el primer paquete de cada conexión:
// los clientes HTTP/2 empiezan con un prefacio fijo. Así el mismo servidor atiende REST y
// gRPC-Web (HTTP/1.1) y gRPC puro (HTTP/2), sin proxy Envoy.
const PREFACIO_HTTP2 = 'PRI * HTTP/2.0';

export function crearServidor(manejador) {
  const h1 = http.createServer(manejador);
  const h2 = http2.createServer(manejador);

  const servidor = net.createServer((socket) => {
    socket.on('error', () => socket.destroy());
    socket.once('data', (trozo) => {
      socket.pause();
      socket.unshift(trozo);
      const esHttp2 = trozo.toString('latin1', 0, PREFACIO_HTTP2.length) === PREFACIO_HTTP2;
      (esHttp2 ? h2 : h1).emit('connection', socket);
      process.nextTick(() => socket.resume());
    });
  });

  // Al cerrar, también se cierran las conexiones abiertas (keep-alive y sesiones HTTP/2).
  const cerrar = servidor.close.bind(servidor);
  servidor.close = (callback) => {
    h1.closeAllConnections();
    h2.close();
    return cerrar(callback);
  };
  return servidor;
}
