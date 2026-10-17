import { Code, ConnectError } from '@connectrpc/connect';
import { DiagramType } from '../gen/codetodiagram/v1/diagram_pb.js';

// Límites de lo que el usuario puede mandar a la IA: diagramas pequeños y enfocados, y una
// petición que no agote la cuota de Gemini.
export const MAX_ARCHIVOS = 10;
export const MAX_CARACTERES = 60_000;
export const MAX_PREGUNTA = 300;

const TIPOS_SOPORTADOS = new Set([DiagramType.ARCHITECTURE, DiagramType.SEQUENCE, DiagramType.CLASS]);

export function validarEntrada({ files, type, question = '' }) {
  const invalido = (mensaje) => {
    throw new ConnectError(mensaje, Code.InvalidArgument);
  };
  if (!files?.length) invalido('Agrega al menos un archivo.');
  if (files.length > MAX_ARCHIVOS) invalido(`Máximo ${MAX_ARCHIVOS} archivos.`);
  if (files.some((archivo) => !archivo.name.trim())) invalido('Cada archivo necesita un nombre.');
  const total = files.reduce((suma, archivo) => suma + archivo.content.length, 0);
  if (total > MAX_CARACTERES) invalido('El código supera los 60 000 caracteres.');
  if (files.every((archivo) => !archivo.content.trim())) {
    invalido('Pega algo de código antes de generar.');
  }
  if (!TIPOS_SOPORTADOS.has(type)) invalido('Elige un tipo de diagrama.');
  if (question.length > MAX_PREGUNTA) invalido(`La pregunta admite hasta ${MAX_PREGUNTA} caracteres.`);
}
