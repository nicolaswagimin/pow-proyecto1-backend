import { connectNodeAdapter } from '@connectrpc/connect-node';
import { interceptorAuth, interceptorLimite } from './interceptores.js';
import { rutasGrpc } from './rutas.js';

// Tamaño máximo de un mensaje gRPC. Connect lee el cuerpo antes de los interceptores, así que
// sin este límite cualquiera (incluso sin sesión) podría mandar un cuerpo enorme y tumbar el
// proceso. 256 KB alcanza de sobra para 60 000 caracteres de código y un diagrama de 12 nodos.
export const MAX_BYTES_GRPC = 256 * 1024;

// gRPC, gRPC-Web y Connect atienden /codetodiagram.v1.DiagramService/*; lo demás va a fallback.
export function crearManejadorGrpc({ impl, fallback }) {
  return connectNodeAdapter({
    routes: rutasGrpc(impl),
    // Primero se autentica y después se aplica el límite por usuario.
    interceptors: [interceptorAuth(), interceptorLimite()],
    readMaxBytes: MAX_BYTES_GRPC,
    fallback,
  });
}
