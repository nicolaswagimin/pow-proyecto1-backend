import { rateLimit } from 'express-rate-limit';

// 10 intentos de login cada 15 minutos por IP.
export const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Espera unos minutos y vuelve a intentarlo.' },
});
