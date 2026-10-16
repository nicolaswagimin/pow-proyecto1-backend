# 0005 · El código generado se commitea

**Estado:** aceptada · 2026-10-15

## Contexto

El código de los mensajes y del servicio sale de `diagram.proto` con Buf. Render ejecuta `npm install` y `npm start`; generar en el despliegue exigiría Buf (y su binario) en el build.

## Decisión

Commitear `src/gen/` (y `src/app/gen/` en el frontend). Regenerar es un paso manual documentado: `npm run proto:gen`.

## Consecuencias

- El despliegue no cambia y no depende de Buf.
- El diff de un cambio en el `.proto` incluye el código regenerado, lo que hace visible su efecto en la revisión.
- Hay que acordarse de regenerar; en el frontend, `npm run proto:check` falla si su copia del `.proto` no es idéntica a la del backend.
