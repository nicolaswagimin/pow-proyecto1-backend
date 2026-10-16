import { generarDiagrama } from '../diagramas/generar.js';
import { validarEntrada } from '../diagramas/entrada.js';
import * as repositorio from '../diagramas/repositorio.js';

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
  };
}
