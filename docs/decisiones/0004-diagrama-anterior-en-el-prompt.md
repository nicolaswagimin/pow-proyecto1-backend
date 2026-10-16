# 0004 · El diagrama anterior va en el prompt

**Estado:** aceptada · 2026-10-15

## Contexto

El diff antes/después empareja nodos por `id`. Si la IA llama `api` a un nodo en una versión y `servidor-api` en la siguiente, el diff muestra un nodo eliminado y otro agregado aunque el código no cambió en esa parte. Eso arruinaría la función principal de la demo.

## Decisión

Al regenerar después de una edición, el cliente manda el diagrama actual en `previous`. El prompt lo incluye y le pide a Gemini que reutilice sus ids para todo lo que no cambió. Además, el diff empareja las conexiones primero por id y luego por extremos y etiqueta, para tolerar conexiones renumeradas.

## Consecuencias

- Los diffs muestran cambios reales en lugar de renombres.
- El prompt crece con el tamaño del diagrama anterior (como mucho 12 nodos, poco texto).
- Si el usuario cambia de tipo de diagrama, no se manda `previous`: comparar arquitectura con secuencia no tiene sentido.
