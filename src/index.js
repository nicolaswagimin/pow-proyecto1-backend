import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { connectNodeAdapter } from '@connectrpc/connect-node';
import { cors as connectCors } from '@connectrpc/connect';
import { iniciarDB, dbDisponible } from './db.js';
import { iaDisponible } from './ia.js';
import authRouter from './routes/auth.js';
import { interceptorAuth, interceptorLimite } from './grpc/interceptores.js';
import { rutasGrpc } from './grpc/rutas.js';
import { crearServicioDiagramas } from './grpc/servicio.js';
import { crearServidor } from './servidor.js';

const PORT = process.env.PORT || 3001;

// Sin JWT_SECRET no se pueden firmar ni verificar sesiones: mejor no arrancar.
if (!process.env.JWT_SECRET) {
  console.error('Falta la variable JWT_SECRET en el archivo .env. Copia el ejemplo de .env.example.');
  process.exit(1);
}

// Orígenes permitidos para CORS (lista separada por comas).
const origenesPermitidos = (process.env.FRONTEND_URL || 'http://localhost:4200')
  .split(',')
  .map((origen) => origen.trim().replace(/\/$/, ''))
  .filter(Boolean);

const app = express();

// Render (y la mayoría de hostings) ponen un proxy delante: así req.ip es la IP real
// del cliente y el límite de intentos se aplica por persona, no al proxy.
app.set('trust proxy', 1);

function origenPermitido(origin, callback) {
  // Peticiones sin origen (curl, Postman, health checks de Render) se permiten.
  if (!origin || origenesPermitidos.includes(origin)) return callback(null, true);
  callback(null, false);
}

app.use(cors({ origin: origenPermitido }));
app.use(express.json());

// ---------- Estado ----------
app.get('/api/health', async (req, res) => {
  res.json({ ok: true, db: await dbDisponible(), ia: iaDisponible() });
});

// ---------- Autenticación ----------
app.use('/api/auth', authRouter);

// ---------- Errores ----------
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

// ---------- Arranque ----------
// gRPC, gRPC-Web y Connect atienden las rutas /codetodiagram.v1.DiagramService/*; todo lo demás
// sigue a Express (REST). El servidor acepta HTTP/1.1 y HTTP/2 en el mismo puerto.
const manejador = connectNodeAdapter({
  routes: rutasGrpc(crearServicioDiagramas()),
  // Primero se autentica y después se aplica el límite por usuario.
  interceptors: [interceptorAuth(), interceptorLimite()],
  fallback: app,
});

// gRPC-Web desde el navegador necesita sus propios headers de CORS (los de Connect + Authorization).
const corsGrpc = cors({
  origin: origenPermitido,
  methods: [...connectCors.allowedMethods],
  allowedHeaders: [...connectCors.allowedHeaders, 'Authorization'],
  exposedHeaders: [...connectCors.exposedHeaders],
  maxAge: 7200,
});
const RUTA_GRPC = '/codetodiagram.v1.';

function manejarPeticion(req, res) {
  if (!req.url.startsWith(RUTA_GRPC)) return manejador(req, res);
  corsGrpc(req, res, () => manejador(req, res));
}

crearServidor(manejarPeticion).listen(PORT, () => {
  console.log(`Backend escuchando en http://localhost:${PORT}`);
  console.log(`CORS permitido para: ${origenesPermitidos.join(', ')}`);
  if (!iaDisponible()) console.warn('Aviso: falta GEMINI_API_KEY, la IA no funcionará.');
});

// Si la BD falla, el servidor sigue levantado y solo se muestra el error.
iniciarDB()
  .then(() => console.log('Base de datos lista (tablas usuarios y diagramas verificadas).'))
  .catch((err) => console.error('No se pudo iniciar la base de datos:', err.message));
