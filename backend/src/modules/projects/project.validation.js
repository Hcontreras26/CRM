import { z } from 'zod';
import { CLAVES } from './tipos.js';

/** Que columnas se ven en un listado y en que orden (#8). */
const columnasDeUnListado = z.array(z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  visible: z.boolean(),
})).optional();

export const createProjectSchema = z.object({
  nombre: z.string().min(1).max(200),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'Slug solo minusculas, numeros y guiones').min(1).max(100),
  // Los tipos salen del catalogo, no de una lista escrita a mano aqui.
  //
  // Estaban en tres sitios —el enum de Postgres y estos dos `z.enum`— y anadir
  // uno obligaba a acordarse de los tres. Que la BASE lo acepte se comprueba
  // aparte, en el controlador: aqui solo se dice cuales existen.
  type: z.enum(CLAVES).default('crm'),
  emoji: z.string().max(10).optional().nullable(),
  meta_account_id: z.string().max(100).optional().nullable(),
  google_account_id: z.string().max(100).optional().nullable(),
  gsc_property: z.string().max(255).optional().nullable(),
  dias_alerta_inactividad: z.number().int().min(1).max(365).default(3),
  producto_label: z.string().max(50).optional(),
  producto_label_plural: z.string().max(50).optional(),
  sociedad_emisora_id: z.number().int().positive().optional().nullable(),
});

export const updateProjectSchema = z.object({
  nombre: z.string().min(1).max(200).optional(),
  type: z.enum(CLAVES).optional(),
  emoji: z.string().max(10).nullable().optional(),
  logo_url: z.string().url('URL inválida').max(2000).nullable().optional(),
  meta_account_id: z.string().max(100).nullable().optional(),
  google_account_id: z.string().max(100).nullable().optional(),
  gsc_property: z.string().max(255).nullable().optional(),
  dias_alerta_inactividad: z.number().int().min(1).max(365).optional(),
  active: z.boolean().optional(),
  producto_label: z.string().max(50).optional(),
  producto_label_plural: z.string().max(50).optional(),
  modules: z.record(z.string(), z.boolean()).optional(),
  lead_base_fields_config: z.record(z.string(), z.object({
    required: z.boolean().optional(),
    visible: z.boolean().optional(),
  })).optional(),
  // Las columnas de cada listado. Misma forma las tres, y por eso el esquema se
  // escribe una vez: si divergen, divergen tambien las pantallas.
  lead_columns: columnasDeUnListado,
  client_columns: columnasDeUnListado,
  product_columns: columnasDeUnListado,
  external_panels: z.array(z.object({
    id: z.string().min(1).max(64),
    label: z.string().min(1).max(80),
    url: z.string().url().max(2000),
    icon: z.string().max(50).optional().nullable(),
    open_in: z.enum(['iframe', 'tab']).optional(),
  })).max(20).optional(),
  sidebar_labels: z.record(z.string().min(1).max(80), z.string().min(1).max(80)).optional(),
  theme_color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Hex inválido (#rrggbb)').nullable().optional(),
  // Correos y formularios de la marca: el fondo sobre el que va su logo y el
  // «no contestar» del que salen. El remitente tiene que ser de un dominio
  // autenticado en la cuenta de Brevo de la marca («APIs → Brevo»).
  color_cabecera: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Hex inválido (#rrggbb)').nullable().optional(),
  remitente_no_contestar: z.preprocess((v) => (v === '' ? null : v), z.string().email('Correo no válido').max(255).nullable().optional()),
  auto_email_documents: z.boolean().optional(),
  sociedad_emisora_id: z.number().int().positive().nullable().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'Al menos un campo' });

export const createSociedadSchema = z.object({
  razon_social: z.string().min(1).max(200),
  serie: z.string().max(20).optional().nullable(),
  nif: z.string().max(30).optional().nullable(),
  pais: z.string().max(60).optional().nullable(),
});
