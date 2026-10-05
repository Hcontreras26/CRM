import { z } from 'zod';

export const ESTADOS_VALIDOS = ['por_hacer', 'en_curso', 'en_revision', 'hecha'];
export const PRIORIDADES_VALIDAS = ['baja', 'media', 'alta'];

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'El título es obligatorio').max(255, 'Máximo 255 caracteres'),
  description: z.string().trim().max(10000, 'Máximo 10.000 caracteres').optional().nullable(),
  status: z.enum(ESTADOS_VALIDOS).default('por_hacer'),
  priority: z.enum(PRIORIDADES_VALIDAS).default('media'),
  due_date: z.string().optional().nullable(),
  project_id: z.number().int().positive('ID de proyecto inválido').optional().nullable(),
  assigned_to: z.number().int().positive('ID de usuario asignado inválido').optional().nullable(),
});

export const updateTaskSchema = z.object({
  title: z.string().trim().min(1, 'El título no puede estar vacío').max(255).optional(),
  description: z.string().trim().max(10000).optional().nullable(),
  priority: z.enum(PRIORIDADES_VALIDAS).optional(),
  due_date: z.string().optional().nullable(),
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
