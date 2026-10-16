import { create } from '@bufbuild/protobuf';
import { DiagramSchema, DiagramType, NodeCategory } from '../gen/codetodiagram/v1/diagram_pb.js';

// Gemini habla el JSON en español de la spec; gRPC, los mensajes del .proto. Estas dos funciones
// son el único punto de traducción entre ambos.

const TIPOS = {
  arquitectura: DiagramType.ARCHITECTURE,
  secuencia: DiagramType.SEQUENCE,
};

const CATEGORIAS = {
  persona: NodeCategory.PERSON,
  componente: NodeCategory.COMPONENT,
  contenedor: NodeCategory.CONTAINER,
  'base-datos': NodeCategory.DATABASE,
  externo: NodeCategory.EXTERNAL,
};

const invertir = (mapa) => Object.fromEntries(Object.entries(mapa).map(([k, v]) => [v, k]));
const TIPOS_JSON = invertir(TIPOS);
const CATEGORIAS_JSON = invertir(CATEGORIAS);

export const tipoAProto = (tipo) => TIPOS[tipo] ?? DiagramType.UNSPECIFIED;
export const tipoAJson = (tipo) => TIPOS_JSON[tipo];

// Recibe un diagrama ya validado (validarDiagrama) y devuelve el mensaje Diagram.
export function jsonAProto(diagrama) {
  return create(DiagramSchema, {
    type: tipoAProto(diagrama.tipo),
    title: diagrama.titulo,
    description: diagrama.descripcion,
    nodes: diagrama.nodos.map((nodo) => ({
      id: nodo.id,
      name: nodo.nombre,
      category: CATEGORIAS[nodo.categoria] ?? NodeCategory.UNSPECIFIED,
      technology: nodo.tecnologia,
      description: nodo.descripcion,
      file: nodo.archivo,
    })),
    edges: diagrama.conexiones.map((conexion) => ({
      id: conexion.id,
      from: conexion.de,
      to: conexion.a,
      label: conexion.etiqueta,
      order: conexion.orden ?? 0,
    })),
  });
}

// Inversa de jsonAProto: sirve para mandar el diagrama anterior a Gemini y para revalidar con el
// mismo validador un diagrama que llega del cliente.
export function protoAJson(diagrama) {
  return {
    tipo: tipoAJson(diagrama.type) ?? 'desconocido',
    titulo: diagrama.title,
    descripcion: diagrama.description,
    nodos: diagrama.nodes.map((nodo) => ({
      id: nodo.id,
      nombre: nodo.name,
      categoria: CATEGORIAS_JSON[nodo.category] ?? 'desconocida',
      tecnologia: nodo.technology,
      descripcion: nodo.description,
      archivo: nodo.file,
    })),
    conexiones: diagrama.edges.map((arista) => ({
      id: arista.id,
      de: arista.from,
      a: arista.to,
      etiqueta: arista.label,
      ...(arista.order > 0 ? { orden: arista.order } : {}),
    })),
  };
}
