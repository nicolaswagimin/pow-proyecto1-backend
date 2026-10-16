import { createContextKey } from '@connectrpc/connect';

// Usuario autenticado de la llamada gRPC; lo deja el interceptor de autenticación.
export const USUARIO = createContextKey(null, { description: 'usuario autenticado' });
