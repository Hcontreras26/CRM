import { z } from 'zod';

const FECHA = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha AAAA-MM-DD');
const ID_GOOGLE = z.string().regex(/^\d{1,30}$/, 'Id de Google no válido');

export const periodoSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  desde: FECHA,
  hasta: FECHA,
}).refine((o) => o.desde <= o.hasta, { message: '`desde` no puede ser posterior a `hasta`' })
  .refine((o) => (Date.parse(o.hasta) - Date.parse(o.desde)) / 86400000 <= 400, { message: 'Como mucho 400 días' });

export const campanaSchema = z.object({ campaignId: ID_GOOGLE });

export const sincronizarSchema = z.object({
  project_id: z.coerce.number().int().positive(),
});

export const asignarSchema = z.object({
  project_id: z.coerce.number().int().positive(),
  // El campus al que se apunta; null la devuelve al de su cuenta.
  destino: z.coerce.number().int().positive().nullable(),
});
