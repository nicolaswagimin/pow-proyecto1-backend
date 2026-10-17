# CodeToDiagram, ronda 2: diagrama de clases y fidelidad al código (diseño)

Fecha: 2026-10-17. Origen: problemas encontrados por el usuario al probar en producción. El usuario
pidió empezar sin preguntas y que las decisiones razonables se anoten en el resumen final; las
marcadas **(decisión de Claude)** son esas.

Reglas de siempre: no tocar el diseño existente (solo tokens y componentes actuales), muchísimos
commits pequeños y reales, documentar cada cambio, nada de push sin aprobación.

## Diagnóstico del nodo inventado

Diagrama 8 del usuario ("Arquitectura con Atributos y Métodos"): el código es un simulador de
combate en Python (`Estadisticas`, `Personaje`, `Arena`, `BitacoraCombate`…) sin base de datos ni
SQL. `BitacoraCombate` solo guarda una lista en memoria e imprime. Gemini agregó el nodo
`base-datos` ("Base de Datos", `SQL`) y la conexión `bitacora-combate → base-datos` "persiste":
**fue inventado**. Además metió atributos y métodos en la descripción de cada nodo y tituló
"Arquitectura con Atributos y Métodos", algo que un diagrama de arquitectura no dibuja.

## 1. Tipo "Clases" (UML)

- `.proto`: `DIAGRAM_TYPE_CLASS = 3`; en `Node`, `repeated Attribute attributes = 7`,
  `repeated Method methods = 8`; `Attribute { name, type }`, `Method { name, repeated Parameter
  parameters, return_type }`, `Parameter { name, type }`.
- JSON de Gemini: `tipo: "clases"`; en cada nodo `atributos: [{ nombre, tipo }]` y
  `metodos: [{ nombre, parametros: [{ nombre, tipo }], retorno }]`.
- Validación: solo el tipo clases admite atributos y métodos; como mucho 12 de cada uno por nodo
  **(decisión de Claude)**; nombres no vacíos.
- Dibujo: se reutiliza `ui-diagrama` (sus filas son los compartimentos de UML). Atributos primero
  (`nombre: tipo`), métodos después (`metodo(param: tipo): retorno`). El glifo de cada fila es la
  visibilidad UML (`+` público, `−` privado si el nombre empieza con `_`) **(decisión de Claude)**:
  `ui-diagrama` gana un campo opcional `glifo` por fila; sin él, todo se ve como antes.
- En clases, las conexiones de herencia (`hereda`, `extiende`, `implementa`) se invierten solo
  para calcular las capas: el padre queda arriba, como en UML **(decisión de Claude)**.
- Selector de tipo con una tercera opción, "Clases".

## 2. Pregunta respetada

- Prompt: el título y la descripción describen solo lo que el diagrama dibuja.
- Regla en el backend: si el tipo no es clases y el título o la descripción hablan de atributos o
  métodos, la respuesta es inválida y se reintenta con ese error.
- Interfaz: `analizarPregunta(pregunta, tipo)` detecta pedidos que el tipo elegido no puede
  mostrar (atributos o métodos fuera de Clases; pasos u orden fuera de Secuencia) y muestra un
  aviso con un botón para cambiar al tipo que sí lo muestra.

## 3. Nodos inventados

- Prompt reforzado: solo elementos presentes en el código; nada de bases de datos, colas o
  servicios que el código no use.
- `verificarEnCodigo(diagrama, archivos)` (backend): un nodo está respaldado si **todas** las
  palabras significativas de su nombre, de su id o de su tecnología aparecen como identificador o
  texto del código, sin contar comentarios ni docstrings **(decisión de Claude)**. Las personas
  (usuario, navegador) quedan exentas: son actores, no código.
- Primer intento con nodos sin respaldo → se reintenta pidiendo quitarlos. Si en el segundo
  intento siguen, el nodo **se marca** (no se descarta) con `not_in_code = 9` en el `.proto`: se
  dibuja con la insignia "no está en el código" y el panel de detalle lo explica. Marcar en vez de
  descartar evita borrar un nodo real por un falso positivo de la heurística
  **(decisión de Claude)**. Atributos y métodos sin respaldo sí se descartan.

## 4. Lenguaje del archivo

- `detectarLenguaje(contenido)` en el frontend reconoce Python, JavaScript, TypeScript, Java, C#,
  Go, PHP y Ruby por patrones del contenido. Si no coincide con la extensión de la pestaña, el
  editor muestra "Parece Python, pero la pestaña se llama index.js" con un botón "Renombrar a
  index.py".

## 5. Nombres largos

- El ancho de cada nodo se calcula según su texto (entre 200 y 320 px) **(decisión de Claude)**,
  y el layout ubica los nodos según su ancho real.
- Lo que aún se corte se ve completo en un tooltip (elemento `<title>` del SVG, agregado a
  `ui-diagrama`) y en un panel "Detalle" debajo del diagrama, que lista cada nodo con su nombre
  completo, tipo, archivo, descripción, atributos, métodos y el aviso de nodo sin respaldo. Hacer
  clic en un nodo abre su detalle.

## Variables de entorno

Ninguna nueva.
