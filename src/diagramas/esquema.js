import { z } from 'zod';

// Forma del JSON que se le pide a Gemini. Aquí solo se revisan tipos, campos obligatorios y
// longitudes; las reglas que cruzan datos (ids únicos, referencias, límites de nodos) viven en
// validar.js para poder dar mensajes en español que nombren el id implicado.

const texto = (max) => z.string().trim().max(max);

// Diagrama de clases: atributos y métodos de cada clase.
const atributo = z.object({
  nombre: texto(60).min(1, 'Cada atributo necesita un nombre.'),
  tipo: texto(60).optional().default(''),
});

const metodo = z.object({
  nombre: texto(60).min(1, 'Cada método necesita un nombre.'),
  parametros: z.array(atributo).optional().default([]),
  retorno: texto(60).optional().default(''),
});

const nodo = z.object({
  id: z.string(),
  nombre: texto(80).min(1, 'Cada nodo necesita un nombre.'),
  categoria: z.string(),
  tecnologia: texto(80).optional().default(''),
  descripcion: texto(300).optional().default(''),
  archivo: texto(200).optional().default(''),
  atributos: z.array(atributo).optional().default([]),
  metodos: z.array(metodo).optional().default([]),
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
