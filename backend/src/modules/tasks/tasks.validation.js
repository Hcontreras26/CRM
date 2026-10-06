import { z } from 'zod';

export const ESTADOS_VALIDOS = ['por_hacer', 'en_curso', 'en_revision', 'hecha'];
export const PRIORIDADES_VALIDAS = ['baja', 'media', 'alta'];

// Fecha y hora completas (lo que manda el tablero) o solo el dia («2026-10-31»).
// Un texto cualquiera, o vacio, se rechaza aqui y no como 500 en la base.
const fecha = z.string().trim().refine((v) => v !== '' && !Number.isNaN(Date.parse(v)), {
  message: 'Fecha límite (due_date) inválida',
});

const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida: usa AAAA-MM-DD')
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Fecha inválida');

const id = z.number().int().positive();

// En la query string todo llega como texto: «false» tiene que ser falso.
// `z.coerce.boolean()` lo convierte en `true`, porque es un texto no vacio.
const booleanoDeQuery = z.enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(255, 'Máximo 255 caracteres'),
  description: z.string().trim().max(10000, 'Máximo 10.000 caracteres').optional().nullable(),
  status: z.enum(ESTADOS_VALIDOS).default('por_hacer'),
  priority: z.enum(PRIORIDADES_VALIDAS).default('media'),
  due_date: fecha.optional().nullable(),
  project_id: id.optional().nullable(),
  assigned_to: id.optional().nullable(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, 'El título no puede estar vacío').max(255).optional(),
  description: z.string().trim().max(10000).optional().nullable(),
  priority: z.enum(PRIORIDADES_VALIDAS).optional(),
  due_date: fecha.optional().nullable(),
  project_id: id.optional().nullable(),
  assigned_to: id.optional().nullable(),
}).refine((d) => Object.keys(d).length > 0, { message: 'No se envió ningún campo para actualizar' });

// Mover: la columna de destino y, si se suelta entre dos tarjetas, cuales son.
// Se mandan los ids y no las posiciones: la posicion la lee el servidor de la
// base, que es la que manda, y no la que tuviera la pantalla hace un rato.
export const moveTaskSchema = z.object({
  status: z.enum(ESTADOS_VALIDOS),
  prev_id: id.optional().nullable(),
  next_id: id.optional().nullable(),
});

export const listTasksQuerySchema = z.object({
  status: z.enum(ESTADOS_VALIDOS).optional(),
  assigned_to: z.coerce.number().int().positive().optional(),
  project_id: z.coerce.number().int().positive().optional(),
  priority: z.enum(PRIORIDADES_VALIDAS).optional(),
  search: z.string().trim().max(100).optional(),
  tag: z.string().trim().min(1).max(50).optional(),
  vencidas: booleanoDeQuery.optional(),
  desde: dia.optional(),
  hasta: dia.optional(),
  incluir_archivadas: booleanoDeQuery.optional().default('false'),
}).refine((q) => !q.desde || !q.hasta || q.desde <= q.hasta, {
  message: 'La fecha «desde» no puede ser posterior a «hasta»',
});

export const metricsQuerySchema = z.object({
  project_id: z.coerce.number().int().positive().optional(),
});

export const addChecklistItemSchema = z.object({
  title: z.string().trim().min(1, 'El título del elemento no puede estar vacío').max(255),
});

export const updateChecklistItemSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  is_completed: z.boolean().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'No se enviaron campos para actualizar' });

export const addCommentSchema = z.object({
  content: z.string().trim().min(1, 'El comentario no puede estar vacío').max(5000),
});

export const COLORES_ETIQUETA = ['sky', 'rose', 'amber', 'emerald', 'violet', 'slate'];

export const addTagSchema = z.object({
  name: z.string().trim().min(1, 'Nombre de etiqueta obligatorio').max(50),
  color: z.enum(COLORES_ETIQUETA).default('sky'),
});

// Solo http(s): un «javascript:» guardado aqui se ejecutaria al pulsarlo.
export const addLinkSchema = z.object({
  url: z.string().trim().max(2000).url('Enlace inválido')
    .refine((u) => /^https?:\/\//i.test(u), 'El enlace tiene que empezar por http:// o https://'),
  title: z.string().trim().max(255).optional().nullable(),
});
