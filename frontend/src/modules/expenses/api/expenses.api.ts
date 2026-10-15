import client, { API_BASE_URL, getAccessToken } from '@/shared/api/client';
import type { ApiResponse } from '@/shared/types';

// Egresos, igual en los dos CRM (#227). Este fichero es IDÉNTICO en MultiCRM y
// en CRM-ISEIE: antes MultiCRM llamaba a /accounting/expenses desde
// `accounting.api.ts` e ISEIE a /expenses desde aquí, cada uno con lo suyo.

// Las categorías del ENUM `expense_category` (backend expense.validation.js).
// Las 3 finales las crea el sistema y no se eligen en el diálogo:
// - comision_pasarela_pago: fee de un payout de Stripe (B0)
// - comision_gestor:        comisión de ventas pagada (E)
// - nomina:                 nómina procesada (F)
export type ExpenseCategory =
  | 'salarios'
  | 'alquiler'
  | 'proveedores'
  | 'software'
  | 'publicidad'
  | 'impuestos'
  | 'servicios'
  | 'mantenimiento'
  | 'otros'
  | 'comision_pasarela_pago'
  | 'comision_gestor'
  | 'nomina';

export const MANUAL_CATEGORIES: ExpenseCategory[] = [
  'salarios', 'alquiler', 'proveedores', 'software', 'publicidad',
  'impuestos', 'servicios', 'mantenimiento', 'otros',
];
export const AUTO_CATEGORIES: ExpenseCategory[] = [
  'comision_pasarela_pago', 'comision_gestor', 'nomina',
];

/** Cómo se lee cada categoría en pantalla (en la base van sin tildes ni espacios). */
export const CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  salarios: 'Salarios',
  alquiler: 'Alquiler',
  proveedores: 'Proveedores',
  software: 'Software',
  publicidad: 'Publicidad',
  impuestos: 'Impuestos',
  servicios: 'Servicios',
  mantenimiento: 'Mantenimiento',
  otros: 'Otros',
  comision_pasarela_pago: 'Comisión pasarela de pago',
  comision_gestor: 'Comisión de gestora',
  nomina: 'Nómina',
};

export interface Expense {
  id: number;
  /** De un campus… */
  project_id?: number | null;
  /** …o de toda una empresa (sin campus). Los dos vacíos: general. */
  issuer_id?: number | null;
  concepto: string;
  importe: number | string;
  fecha: string;
  categoria: ExpenseCategory;
  notas?: string | null;
  registrado_por?: number | null;
  registrado_por_nombre?: string | null;
  proyecto_nombre?: string | null;
  empresa_nombre?: string | null;
  // Comprobante (PDF/JPG/PNG/WEBP) — opcional
  comprobante_url?: string | null;
  comprobante_key?: string | null;
  comprobante_mime?: string | null;
  comprobante_size_bytes?: number | null;
  // Trazabilidad de origen — si no es null, lo creó el sistema y no se edita
  // a mano (el servidor contesta 409).
  source_payable_id?: number | null;
  source_stripe_payout_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ExpenseInput {
  project_id?: number | null;
  issuer_id?: number | null;
  concepto: string;
  importe: number;
  fecha: string;
  categoria: ExpenseCategory;
  notas?: string | null;
  comprobante_url?: string | null;
  comprobante_key?: string | null;
  comprobante_mime?: string | null;
  comprobante_size_bytes?: number | null;
}

export interface ComprobanteUploadResult {
  comprobante_url: string;
  comprobante_key: string;
  comprobante_mime: string;
  comprobante_size_bytes: number;
}

/** Los totales de TODO el filtro, calculados en el servidor (no la página que se ve). */
export interface ExpensesResumen {
  num: number;
  total: number;
  sin_campus: { num: number; total: number };
  por_categoria: Array<{ categoria: ExpenseCategory; num: number; total: number }>;
}

type Params = Record<string, string | number | undefined> | undefined;

function qs(params: Params): string {
  const filtered = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Record<string, string>;
  const s = new URLSearchParams(filtered).toString();
  return s ? '?' + s : '';
}

export const expensesApi = {
  list: (params: Params = {}): Promise<ApiResponse<Expense[]>> =>
    client.get(`/expenses${qs(params)}`),
  resumen: (params: Params = {}): Promise<ApiResponse<ExpensesResumen>> =>
    client.get(`/expenses/resumen${qs(params)}`),
  get: (id: number): Promise<ApiResponse<Expense>> =>
    client.get(`/expenses/${id}`),
  create: (data: ExpenseInput): Promise<ApiResponse<Expense>> =>
    client.post('/expenses', data),
  update: (id: number, data: Partial<ExpenseInput>): Promise<ApiResponse<Expense>> =>
    client.patch(`/expenses/${id}`, data),
  delete: (id: number): Promise<ApiResponse<void>> =>
    client.delete(`/expenses/${id}`),

  // Sube el comprobante y devuelve los metadatos para anexar al alta/edición.
  uploadComprobante: (file: File): Promise<ApiResponse<ComprobanteUploadResult>> => {
    const fd = new FormData();
    fd.append('file', file);
    return client.post('/expenses/upload-comprobante', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  /**
   * Abre el comprobante de un gasto. Va por fetch con el token: un enlace
   * normal del navegador NO manda la cabecera Authorization y la ruta daba 401
   * siempre (ISEIE lo tenía así). Vale para las direcciones viejas de MultiCRM
   * (`/api/accounting/expenses/comprobante/…`): se usa solo la clave.
   */
  openComprobante: async (url: string): Promise<void> => {
    const key = String(url).split('/comprobante/').pop() || '';
    const tok = getAccessToken();
    const res = await fetch(`${API_BASE_URL}/expenses/comprobante/${encodeURIComponent(key)}`, {
      headers: tok ? { Authorization: `Bearer ${tok}` } : {}, credentials: 'include',
    });
    if (!res.ok) throw new Error('No se pudo abrir el comprobante');
    const blob = await res.blob();
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.target = '_blank'; a.rel = 'noopener';
    document.body.appendChild(a); a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(u); }, 60000);
  },
};
