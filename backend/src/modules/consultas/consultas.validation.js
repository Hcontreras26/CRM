import { z } from 'zod';

export const responderSchema = z.object({
  texto: z.string({ required_error: 'Falta la respuesta' }).trim()
    .min(1, 'Falta la respuesta: escríbela en «Tu respuesta».')
    .max(20000, 'La respuesta es demasiado larga: como mucho 20 000 caracteres.'),
});

export const reasignarSchema = z.object({
  tutorId: z.coerce.number({ invalid_type_error: 'Elige el tutor' }).int().positive('Elige el tutor'),
});

export const tokenTutorSchema = z.object({
  projectId: z.coerce.number({ invalid_type_error: 'Elige el campus' }).int().positive('Elige el campus'),
  // null o vacío: quitar el token.
  token: z.string().trim().max(200, 'Ese token es demasiado largo').nullable().optional(),
});

export const listarSchema = z.object({
  estado: z.enum(['pendientes', 'abierta', 'respondida', 'cerrada']).optional(),
  sinTutor: z.enum(['1', 'true']).optional(),
  buscar: z.string().trim().max(100).optional(),
});
