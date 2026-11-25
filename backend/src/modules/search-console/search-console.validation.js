import { z } from 'zod';

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');

export const periodoSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  desde: FECHA,
  hasta: FECHA,
  limite: z.coerce.number().int().positive().max(2000).optional(),
  buscar: z.string().trim().max(200).optional(),
}).refine((o) => o.desde <= o.hasta, { message: '`desde` no puede ser posterior a `hasta`' })
  .refine((o) => (Date.parse(o.hasta) - Date.parse(o.desde)) / 86400000 <= 480, { message: 'Como mucho 16 meses (lo que guarda Google)' });

export const campusSchema = z.object({
  projectId: z.coerce.number().int().positive(),
});

export const sincronizarSchema = z.object({
  project_id: z.coerce.number().int().positive(),
});
