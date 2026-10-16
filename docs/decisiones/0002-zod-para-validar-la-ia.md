# 0002 · Zod para validar la respuesta de la IA

**Estado:** aceptada · 2026-10-15

## Contexto

Gemini puede devolver JSON mal formado, campos de más o de menos, o conexiones a nodos que inventó. La regla del producto es fallar cerrado: nunca dibujar un diagrama roto.

## Decisión

Validar en dos partes:

1. **Zod** (`src/diagramas/esquema.js`) para la forma: tipos, campos obligatorios, longitudes y valores por defecto.
2. **Reglas propias** (`src/diagramas/validar.js`) para lo que cruza datos: ids únicos y con formato, conexiones a nodos existentes, sin autoconexiones, orden en secuencia y máximo 12 nodos.

Todas las reglas devuelven mensajes en español que nombran el id implicado, y se juntan en una lista.

## Consecuencias

- Esa lista se le pasa a Gemini en el único reintento, así que la IA sabe exactamente qué corregir.
- Las mismas reglas existen en el frontend (`validar.ts`); si cambian, hay que cambiarlas en los dos lados.
- Una dependencia más (`zod`), a cambio de no escribir a mano la validación de forma.
