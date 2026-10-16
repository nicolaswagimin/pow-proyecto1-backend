import { z } from 'zod';

// Forma del JSON que se le pide a Gemini. Aquí solo se revisan tipos, campos obligatorios y
// longitudes; las reglas que cruzan datos (ids únicos, referencias, límites de nodos) viven en
// validar.js para poder dar mensajes en español que nombren el id implicado.

const texto = (max) => z.string().trim().max(max);

const nodo = z.object({
  id: z.string(),
  nombre: texto(80).min(1, 'Cada nodo necesita un nombre.'),
  categoria: z.string(),
  tecnologia: texto(80).optional().default(''),
  descripcion: texto(300).optional().default(''),
  archivo: texto(200).optional().default(''),
});

const conexion = z.object({
  id: z.string(),
  de: z.string(),
  a: z.string(),
  etiqueta: texto(80).optional().default(''),
  orden: z.number().int().optional(),
});

export const esquemaDiagrama = z.object({
  tipo: z.string(),
  titulo: texto(200).min(1, 'El diagrama necesita un título.'),
  descripcion: texto(500).optional().default(''),
  nodos: z.array(nodo),
  conexiones: z.array(conexion).optional().default([]),
});
