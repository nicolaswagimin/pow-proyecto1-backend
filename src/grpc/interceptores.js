import { Code, ConnectError } from '@connectrpc/connect';
import { verificarToken } from '../middleware/auth.js';
import { USUARIO } from './contexto.js';

// Valida el JWT del metadato "authorization: Bearer <token>" (el mismo que usa REST) y deja el
// usuario en el contexto de la llamada.
export function interceptorAuth({ verificar = verificarToken } = {}) {
  return (next) => async (req) => {
    const [esquema, token] = (req.header.get('authorization') || '').split(' ');
    if (esquema !== 'Bearer' || !token) {
      throw new ConnectError('Inicia sesión para continuar.', Code.Unauthenticated);
    }

    let usuario;
    try {
      usuario = await verificar(token);
    } catch (err) {
      console.error(err.message);
      throw new ConnectError('No se pudo verificar la sesión. Inténtalo de nuevo.', Code.Unavailable);
    }
    if (!usuario) {
      throw new ConnectError(
        'Tu sesión expiró o no es válida. Inicia sesión de nuevo.',
        Code.Unauthenticated,
      );
    }

    req.contextValues.set(USUARIO, usuario);
    return next(req);
  };
}
