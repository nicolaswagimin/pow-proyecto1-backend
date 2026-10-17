# Despliegue · CodeToDiagram

El backend va en **Render** (Web Service gratuito) y la base de datos en **Neon** (PostgreSQL gratuito). El frontend va en Vercel (ver el README de [pow-proyecto1-frontend](https://github.com/nicolaswagimin/pow-proyecto1-frontend)).

## 1. Base de datos en Neon

1. Crea un proyecto en <https://neon.tech> (uno por proyecto, o una base distinta para cada uno).
2. Copia la **connection string** de PostgreSQL. Tiene la forma `postgresql://usuario:contraseña@host/neondb?sslmode=require`.
3. No hace falta crear las tablas: el backend ejecuta `schema.sql` al arrancar. Si prefieres hacerlo a mano, pégalo en el editor SQL de Neon.

Neon exige SSL: deja `DB_SSL` sin definir o en `true`.

## 2. API key de Gemini

Crea una en <https://aistudio.google.com/apikey>. Puede ser la misma para los tres proyectos.

## 3. Web Service en Render

1. En <https://render.com>: **New → Web Service** y conecta el repositorio `pow-proyecto1-backend`.
2. Configura:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
3. En **Environment**, agrega:

| Variable | Valor |
|---|---|
| `DATABASE_URL` | La connection string de Neon |
| `GEMINI_API_KEY` | Tu API key |
| `JWT_SECRET` | Un secreto nuevo (no el de local), generado con `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `FRONTEND_URL` | La URL de Vercel sin `/` final; puedes sumar las locales: `https://pow-proyecto1.vercel.app,http://localhost:4200,http://localhost:4201` |
| `JWT_EXPIRES_IN` | Opcional (`7d` por defecto) |
| `GEMINI_MODEL` | Opcional (`gemini-2.5-flash` por defecto) |

No definas `PORT`: Render lo asigna.

El servicio de diagramas (gRPC) **no necesita variables nuevas**: usa las mismas que REST. Tampoco hace falta ejecutar Buf en Render, porque el código generado (`src/gen/`) está en el repositorio.

4. Despliega y abre `https://pow-proyecto1-backend.onrender.com/api/health`. Debe responder `{"ok":true,"db":true,"ia":true}`.
5. Esa URL más `/api` es la que usa `src/environments/environment.ts` del frontend para REST (`apiUrl`), y la URL sola, sin `/api`, es la del servicio gRPC-Web (`grpcUrl`).

### Redespliegue automático

Cada `git push` a `main` vuelve a desplegar el servicio. Antes de hacer push con una variable de entorno nueva, agrégala primero en **Environment**; si no, el servicio arranca sin ella.

## 4. Conectar CORS

Cuando Vercel te dé la URL del frontend, ponla en `FRONTEND_URL` y guarda. Render vuelve a desplegar solo.

## gRPC en Render

Render termina TLS en su proxy. Probado el 2026-10-16 después del despliegue:

- **gRPC-Web** (lo que usa el frontend) funciona, también el streaming de `StreamDiagram`.
- **gRPC puro** también funciona contra la URL `https://`, por ejemplo con `buf curl --protocol grpc` (sin `--http2-prior-knowledge`: HTTP/2 se negocia con TLS). Los comandos están en [grpc.md](grpc.md#en-render).

## Comprobaciones

| Síntoma | Causa probable |
|---|---|
| El servicio no arranca y el log dice "Falta la variable JWT_SECRET" | Falta `JWT_SECRET` |
| `/api/health` responde `"db": false` | `DATABASE_URL` mal copiada, o `DB_SSL=false` con Neon |
| `/api/health` responde `"ia": false` | Falta `GEMINI_API_KEY` |
| El frontend dice "No hay conexión con el backend" pero `/api/health` funciona en el navegador | El origen de Vercel no está en `FRONTEND_URL` (CORS) |
| La primera petición tarda unos 50 s | El plan gratuito de Render duerme el servicio tras un rato sin uso; el frontend avisa "El servidor está despertando" y reintenta 3 veces |
| El diagrama falla con un error de CORS en la consola | El origen del frontend no está en `FRONTEND_URL` (las rutas gRPC usan la misma lista) |

## En local

```bash
npm install
cp .env.example .env     # rellena DATABASE_URL, GEMINI_API_KEY y JWT_SECRET
npm run dev              # http://localhost:3001, se reinicia al guardar
```

Desde la carpeta raíz del repositorio de proyectos, `./demo.sh` arranca los tres backends y los tres frontends a la vez.
