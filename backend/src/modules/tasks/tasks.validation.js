import { z } from 'zod';

export const ESTADOS_VALIDOS = ['por_hacer', 'en_curso', 'en_revision', 'hecha'];
export const PRIORIDADES_VALIDAS = ['baja', 'media', 'alta'];

const dateValidation = z.string().refine((val) => !val || !isNaN(Date.parse(val)), {
  message: 'Fecha límite (due_date) inválida',
});

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(255, 'Máximo 255 caracteres'),
  description: z.string().trim().max(10000, 'Máximo 10.000 caracteres').optional().nullable(),
  status: z.enum(ESTADOS_VALIDOS).default('por_hacer'),
  priority: z.enum(PRIORIDADES_VALIDAS).default('media'),
  due_date: dateValidation.optional().nullable(),
  project_id: z.number().int().positive('ID de proyecto inválido').optional().nullable(),
  assigned_to: z.number().int().positive('ID de usuario asignado inválido').optional().nullable(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, 'El título no puede estar vacío').max(255).optional(),
  description: z.string().trim().max(10000).optional().nullable(),
  priority: z.enum(PRIORIDADES_VALIDAS).optional(),
  due_date: dateValidation.optional().nullable(),
  project_id: z.number().int().positive().optional().nullable(),
  assigned_to: z.number().int().positive().optional().nullable(),
}).refine((d) => Object.keys(d).length > 0, { message: 'No se envió ningún campo para actualizar' });

export const moveTaskSchema = z.object({
  status: z.enum(ESTADOS_VALIDOS),
  position: z.number().positive('La posición debe ser un número positivo').optional(),
  prevPosition: z.number().positive().optional().nullable(),
  nextPosition: z.number().positive().optional().nullable(),
});

export const listTasksQuerySchema = z.object({
  status: z.enum(ESTADOS_VALIDOS).optional(),
  assigned_to: z.coerce.number().int().positive().optional(),
  project_id: z.coerce.number().int().positive().optional(),
  priority: z.enum(PRIORIDADES_VALIDAS).optional(),
  search: z.string().trim().max(100).optional(),
  incluir_archivadas: z.coerce.boolean().optional().default(false),
});

export const addChecklistItemSchema = z.object({
  title: z.string().trim().min(1, 'El título del elemento no puede estar vacío').max(255),
  position: z.number().positive().optional(),
});

export const updateChecklistItemSchema = z.object({
  title: z.string().trim().min(1).max(255).optional(),
  is_completed: z.boolean().optional(),
  position: z.number().positive().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'No se enviaron campos para actualizar' });

export const addCommentSchema = z.object({
  content: z.string().trim().min(1, 'El comentario no puede estar vacío').max(5000),
});

export const addTagSchema = z.object({
  name: z.string().trim().min(1, 'Nombre de etiqueta obligatorio').max(50),
  color: z.string().trim().max(30).default('sky'),
});
