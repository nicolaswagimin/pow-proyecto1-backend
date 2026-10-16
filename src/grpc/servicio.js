import { toJson } from '@bufbuild/protobuf';
import { timestampFromDate } from '@bufbuild/protobuf/wkt';
import { Code, ConnectError } from '@connectrpc/connect';
import { DiagramSchema, ProgressStage } from '../gen/codetodiagram/v1/diagram_pb.js';
import { protoAJson, tipoAJson, tipoAProto } from '../diagramas/convertir.js';
import { calcularDiff } from '../diagramas/diff.js';
import { generarDiagrama } from '../diagramas/generar.js';
import { validarEntrada } from '../diagramas/entrada.js';
import * as repositorio from '../diagramas/repositorio.js';
import { validarDiagrama } from '../diagramas/validar.js';
import { USUARIO } from './contexto.js';

const MENSAJES_PROGRESO = {
  [ProgressStage.ANALYZING]: 'Analizando el código…',
  [ProgressStage.VALIDATING]: 'Validando el diagrama…',
  [ProgressStage.RETRYING]: 'El primer intento no pasó la validación. Reintentando…',
  [ProgressStage.DONE]: 'Listo.',
};

const usuarioDe = (ctx) => ctx.values.get(USUARIO).id;

// Fila de la tabla diagramas → SavedDiagramSummary.
function resumen(fila) {
  return {
    id: fila.id,
    title: fila.titulo,
    type: tipoAProto(fila.tipo),
    question: fila.pregunta ?? '',
    nodeCount: fila.diagrama?.nodes?.length ?? 0,
    createdAt: timestampFromDate(new Date(fila.creado_en)),
  };
}

const progreso = (stage) => ({
  event: { case: 'progress', value: { stage, message: MENSAJES_PROGRESO[stage] } },
});

// Implementación de DiagramService. Las dependencias se inyectan para poder probarla con un
// Gemini y una base de datos falsos.
export function crearServicioDiagramas({ generar = generarDiagrama, repo = repositorio } = {}) {
  return {
    async generateDiagram(req, ctx) {
      validarEntrada(req);
      const diagram = await generar(
        { archivos: req.files, tipo: req.type, pregunta: req.question, anterior: req.previous, signal: ctx.signal },
        {},
      );
      return { diagram };
    },

    // Envía cada etapa apenas ocurre, después el diagrama y, si había uno anterior, el diff.
    async *streamDiagram(req, ctx) {
      validarEntrada(req);
      const cola = [];
      let avisar = () => {};
      let terminado = false;

      const tarea = generar(
        { archivos: req.files, tipo: req.type, pregunta: req.question, anterior: req.previous, signal: ctx.signal },
        {
          alProgreso: (stage) => {
            cola.push(progreso(stage));
            avisar();
          },
        },
      ).finally(() => {
        terminado = true;
        avisar();
      });
      tarea.catch(() => {}); // el error se relanza abajo con await tarea

      while (!terminado || cola.length) {
        if (cola.length) yield cola.shift();
        else await new Promise((resolver) => (avisar = resolver));
      }

      const diagram = await tarea;
      yield { event: { case: 'diagram', value: diagram } };
      if (req.previous) {
        yield { event: { case: 'diff', value: calcularDiff(req.previous, diagram) } };
      }
      yield progreso(ProgressStage.DONE);
    },

    // Solo se guardan diagramas que pasan la misma validación que la respuesta de la IA.
    async saveDiagram(req, ctx) {
      if (!req.diagram) throw new ConnectError('Falta el diagrama.', Code.InvalidArgument);
      validarEntrada({ files: req.files, type: req.diagram.type, question: req.question });
      const validacion = validarDiagrama(protoAJson(req.diagram));
      if (!validacion.ok) {
        throw new ConnectError(`El diagrama no es válido: ${validacion.errores[0]}`, Code.InvalidArgument);
      }
      const fila = await repo.guardar(usuarioDe(ctx), {
        titulo: (req.title.trim() || req.diagram.title).slice(0, 200),
        tipo: tipoAJson(req.diagram.type),
        pregunta: req.question,
        archivos: req.files.map(({ name, content }) => ({ name, content })),
        diagrama: toJson(DiagramSchema, req.diagram),
      });
      return { diagram: resumen(fila) };
    },

    async listDiagrams(_req, ctx) {
      const filas = await repo.listar(usuarioDe(ctx));
      return { diagrams: filas.map(resumen) };
    },
  };
}
