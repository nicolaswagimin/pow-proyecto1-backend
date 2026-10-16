import { Code, ConnectError } from '@connectrpc/connect';
import { verificarToken } from '../middleware/auth.js';
import { crearLimitador } from '../limitador.js';
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

const METODOS_CON_IA = new Set(['GenerateDiagram', 'StreamDiagram']);

// 60 generaciones cada 15 minutos por usuario. Solo cuentan las llamadas que usan la IA; el
// reintento interno con Gemini no suma porque es la misma llamada.
export function interceptorLimite({
  limitador = crearLimitador({ limite: 60, ventanaMs: 15 * 60 * 1000 }),
} = {}) {
  return (next) => async (req) => {
    if (METODOS_CON_IA.has(req.method.name)) {
      const usuario = req.contextValues.get(USUARIO);
      if (!limitador.consumir(`usuario-${usuario.id}`)) {
        throw new ConnectError(
          'Hiciste muchas peticiones seguidas. Espera unos minutos y vuelve a intentarlo.',
          Code.ResourceExhausted,
        );
      }
    }
    return next(req);
  };
}
