import { ProgressStage } from '../gen/codetodiagram/v1/diagram_pb.js';
import { calcularDiff } from '../diagramas/diff.js';
import { generarDiagrama } from '../diagramas/generar.js';
import { validarEntrada } from '../diagramas/entrada.js';
import * as repositorio from '../diagramas/repositorio.js';

const MENSAJES_PROGRESO = {
  [ProgressStage.ANALYZING]: 'Analizando el código…',
  [ProgressStage.VALIDATING]: 'Validando el diagrama…',
  [ProgressStage.RETRYING]: 'El primer intento no pasó la validación. Reintentando…',
  [ProgressStage.DONE]: 'Listo.',
};

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
  };
}
