import client from '@/shared/api/client';
import type { ApiResponse } from '@/shared/types';

// Los egresos (tipos, categorías y llamadas) viven en su módulo:
// `modules/expenses/api/expenses.api.ts`, igual en los dos CRM (#227).

export interface ReceivableItem {
  id: number;
  cliente_nombre?: string;
  producto_nombre?: string;
  importe_pendiente: number | string;
  fecha_compromiso_pago?: string | null;
  vencido?: boolean;
  conversion_id?: number;
}

export interface AccountingDashboardData {
  totals?: {
    income?: number;
    expenses?: number;
    payable?: number;
    receivable?: number;
    netResult?: number;
  };
  byMonth?: Array<{ month: string; income: number; expenses: number }>;
  byCategory?: Array<{ categoria: string; total: number }>;
  cuentas_por_cobrar?: ReceivableItem[];
  cuentas_por_pagar?: Array<Record<string, unknown>>;
}

type Params = Record<string, string | number | undefined> | undefined;

function qs(params: Params): string {
  const filtered = Object.fromEntries(
    Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as Record<string, string>;
  const s = new URLSearchParams(filtered).toString();
  return s ? '?' + s : '';
}

export const accountingApi = {
  dashboard: (params: Params = {}): Promise<ApiResponse<AccountingDashboardData>> =>
    client.get(`/accounting/dashboard${qs(params)}`),
  // Cuentas por cobrar con filtros gestora/proyecto/periodo.
  receivable: (params: Params = {}): Promise<ApiResponse<any>> =>
    client.get(`/accounting/receivable${qs(params)}`),
};
