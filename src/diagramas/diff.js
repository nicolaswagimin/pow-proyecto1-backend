import { create } from '@bufbuild/protobuf';
import { ChangeKind, DiagramDiffSchema } from '../gen/codetodiagram/v1/diagram_pb.js';

// Diff entre dos versiones de un diagrama. Las mismas reglas están en el frontend
// (src/app/diagrama/diff.ts); si cambias una, cambia la otra.

const CAMPOS_NODO = ['name', 'category', 'technology', 'description'];

export function calcularDiff(antes, despues) {
  return create(DiagramDiffSchema, {
    nodes: ordenar(diffNodos(antes.nodes, despues.nodes)),
    edges: ordenar(diffAristas(antes.edges, despues.edges)),
  });
}

// Los nodos se emparejan por id; un nodo cambia si cambia alguno de sus datos visibles.
function diffNodos(antes, despues) {
  const previos = new Map(antes.map((nodo) => [nodo.id, nodo]));
  const actuales = new Set(despues.map((nodo) => nodo.id));
  const cambios = [];
  for (const nodo of despues) {
    const previo = previos.get(nodo.id);
    if (!previo) cambios.push({ id: nodo.id, kind: ChangeKind.ADDED });
    else if (CAMPOS_NODO.some((campo) => previo[campo] !== nodo[campo])) {
      cambios.push({ id: nodo.id, kind: ChangeKind.MODIFIED });
    }
  }
  for (const nodo of antes) {
    if (!actuales.has(nodo.id)) cambios.push({ id: nodo.id, kind: ChangeKind.REMOVED });
  }
  return cambios;
}

// Las conexiones se emparejan primero por id (si une los mismos nodos) y, las que quedan, por
// extremos + etiqueta: así una conexión que la IA renumeró no aparece como cambio.
function diffAristas(antes, despues) {
  const pares = [];
  const libresAntes = new Set(antes);
  const libresDespues = new Set(despues);

  const porId = new Map(despues.map((arista) => [arista.id, arista]));
  for (const previa of antes) {
    const actual = porId.get(previa.id);
    if (actual && actual.from === previa.from && actual.to === previa.to) {
      emparejar(previa, actual);
    }
  }

  const clave = (arista) => `${arista.from}|${arista.to}|${arista.label}`;
  for (const previa of [...libresAntes].sort(porIdAsc)) {
    const actual = [...libresDespues].sort(porIdAsc).find((a) => clave(a) === clave(previa));
    if (actual) emparejar(previa, actual);
  }

  const cambios = pares
    .filter(([previa, actual]) => previa.label !== actual.label || previa.order !== actual.order)
    .map(([, actual]) => ({ id: actual.id, kind: ChangeKind.MODIFIED }));
  for (const arista of libresDespues) cambios.push({ id: arista.id, kind: ChangeKind.ADDED });
  for (const arista of libresAntes) cambios.push({ id: arista.id, kind: ChangeKind.REMOVED });
  return cambios;

  function emparejar(previa, actual) {
    pares.push([previa, actual]);
    libresAntes.delete(previa);
    libresDespues.delete(actual);
  }
}

function porIdAsc(a, b) {
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function ordenar(cambios) {
  return cambios.sort((a, b) => porIdAsc(a, b) || a.kind - b.kind);
}
