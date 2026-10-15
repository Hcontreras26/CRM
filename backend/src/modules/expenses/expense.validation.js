import { z } from 'zod';

// Categorías del ENUM `expense_category` (no es un CHECK: una categoría nueva
// exige `ALTER TYPE … ADD VALUE`). Las 9 originales + 3 que crea el sistema
// (EPIC B, migraciones 082 en MultiCRM y 081/114 en ISEIE):
// comision_pasarela_pago (B0), comision_gestor (E) y nomina (F).
export const CATEGORIES = [
  'salarios',
  'alquiler',
  'proveedores',
  'software',
  'publicidad',
  'impuestos',
  'servicios',
  'mantenimiento',
  'otros',
  'comision_pasarela_pago',
  'comision_gestor',
  'nomina',
];

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

// Schema común para el blob de comprobante. Lo rellena el endpoint
// /upload-comprobante y el cliente lo manda junto al create/update.
const comprobanteShape = {
  comprobante_url: z.string().url().max(1000).nullable().optional(),
  comprobante_key: z.string().max(500).nullable().optional(),
  comprobante_mime: z.string().max(50).nullable().optional(),
  comprobante_size_bytes: z.number().int().nonnegative().nullable().optional(),
};

// De quién es: un campus, una empresa entera, o ninguno (general). Las dos
// cosas a la vez no: la empresa de un campus ya sale del campus.
const destinoShape = {
  project_id: z.number().int().positive().nullable().optional(),
  issuer_id: z.number().int().positive().nullable().optional(),
};
const unSoloDestino = (d) => !(d.project_id && d.issuer_id);
const MENSAJE_DESTINO = { message: 'Un egreso es de un campus o de una empresa, no de los dos' };

export const createExpenseSchema = z.object({
  ...destinoShape,
  concepto: z.string().trim().min(1, 'Concepto requerido').max(255),
  importe: z.number().positive('Importe debe ser > 0'),
  fecha: z.string().regex(FECHA, 'Fecha del egreso requerida (YYYY-MM-DD)'),
  categoria: z.enum(CATEGORIES).default('otros'),
  notas: z.string().max(2000).optional().nullable(),
  ...comprobanteShape,
}).refine(unSoloDestino, MENSAJE_DESTINO);

export const updateExpenseSchema = z.object({
  ...destinoShape,
  concepto: z.string().trim().min(1).max(255).optional(),
  importe: z.number().positive().optional(),
  fecha: z.string().regex(FECHA).optional(),
  categoria: z.enum(CATEGORIES).optional(),
  notas: z.string().max(2000).nullable().optional(),
  ...comprobanteShape,
})
  .refine((d) => Object.keys(d).length > 0, { message: 'Al menos un campo' })
  .refine(unSoloDestino, MENSAJE_DESTINO);

// Filtros del listado y del resumen. El ámbito (`projectId` / `issuerId`) lo
// resuelve `proyectosDelAmbito`; aquí solo se comprueba que tengan forma.
const filtrosShape = {
  projectId: z.coerce.number().int().positive().optional(),
  issuerId: z.coerce.number().int().positive().optional(),
  categoria: z.enum(CATEGORIES).optional(),
  from: z.string().regex(FECHA).optional(),
  to: z.string().regex(FECHA).optional(),
  q: z.string().trim().max(100).optional(),
  origen: z.enum(['manual', 'auto']).optional(),
};

export const listExpensesSchema = z.object({
  ...filtrosShape,
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const resumenExpensesSchema = z.object(filtrosShape);
