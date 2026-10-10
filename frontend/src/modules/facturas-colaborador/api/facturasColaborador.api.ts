import client from '@/shared/api/client';

/*
  Facturas de colaboradores (#202): la gente de fuera que factura al grupo cada
  mes sube su factura por un enlace personal, una por empresa y mes.
*/

export const AREAS = ['soporte', 'desarrollo', 'wordpress', 'seo', 'contenido', 'otra'] as const;
export type Area = typeof AREAS[number];

export const AREA_ES: Record<Area, string> = {
  soporte: 'Soporte', desarrollo: 'Desarrollo', wordpress: 'WordPress', seo: 'SEO', contenido: 'Contenido', otra: 'Otra',
};

export type EstadoFactura = 'sin_enviar' | 'enviado' | 'abierto' | 'recibida' | 'anulada' | 'no_enviado' | 'caducado';

export interface EmpresaDelGrupo { id: number; razon_social: string; nif: string }

// Cómo cobra de cada empresa (#202, segunda parte, «Añadido 01/10 (tarde)»).
export const MODALIDADES = ['fijo', 'hora', 'proyecto'] as const;
export type Modalidad = typeof MODALIDADES[number];
export const MODALIDAD_ES: Record<Modalidad, string> = { fijo: 'Fijo', hora: 'Por hora', proyecto: 'Por proyecto' };

/** Cómo cobra: sin modalidad, las fichas de la primera parte. Los números llegan como texto de la base. */
export interface ComoCobra {
  modalidad: Modalidad | null;
  importe_fijo: number | string | null;
  tarifa_hora: number | string | null;
  iva_pct: number | string | null;
  irpf_pct: number | string | null;
}

export interface EmpresaDelColaborador extends ComoCobra { issuer_id: number; razon_social: string; importe_acordado: number | string | null }

export interface Colaborador {
  id: number;
  nombre: string;
  email: string;
  nif: string | null;
  area: Area;
  notas: string | null;
  user_id: number | null;
  usuario_nombre: string | null;
  activo: boolean;
  alta_desde: string | null; // AAAA-MM
  baja_desde: string | null; // AAAA-MM
  empresas: EmpresaDelColaborador[];
  /** También factura a empresas que quien mira no lleva: sus datos los cambia el super admin. */
  compartido?: boolean;
}

export interface ColaboradorEnvio {
  nombre: string;
  email: string;
  nif?: string | null;
  area: Area;
  notas?: string | null;
  alta_desde?: string | null;
  empresas: {
    issuer_id: number; importe_acordado: number | null;
    modalidad: Modalidad | null; importe_fijo: number | null; tarifa_hora: number | null;
    iva_pct: number | null; irpf_pct: number | null;
  }[];
}

export interface FacturaDelMes {
  id: number;
  colaborador_id: number;
  issuer_id: number;
  periodo: string;
  colaborador_nombre: string;
  email: string;
  area: Area;
  empresa: string;
  importe_esperado: string | null;
  importe: string | null;
  diferencia: string | null;
  numero_factura: string | null;
  numero_recepcion: string | null;
  subida_at: string | null;
  enviado_at: string | null;
  abierto_at: string | null;
  caduca_at: string | null;
  anulada_at: string | null;
  motivo_anulacion: string | null;
  nombre_original: string | null;
  tamano: number | null;
  estado: EstadoFactura;
}

export interface Mes {
  periodo: string;
  mes: string;
  resumen: { total: number; recibidas: number; importe_recibido: number; importe_acordado: number };
  facturas: FacturaDelMes[];
}

export interface LineaRegistro {
  id: number;
  evento: string;
  creado_at: string;
  ip: string | null;
  detalle: Record<string, unknown>;
  usuario_nombre: string | null;
  factura_id?: number | null;
}

/** Lo que ve el colaborador en su enlace o en «Mi factura». */
export interface FacturaDelColaborador {
  id?: number;
  estado: EstadoFactura;
  periodo: string;
  mes: string;
  colaborador: string;
  empresa: {
    razon_social: string; nif: string | null; direccion: string | null;
    cp: string | null; ciudad: string | null; pais: string | null; logo_url: string | null;
  };
  importe_acordado: number | null;
  caduca_at: string | null;
  recibida: null | {
    subida_at: string; numero_recepcion: string; importe: number | null; numero_factura: string | null; archivo: string | null;
  };
  enlace?: string | null;
}

type R<T> = Promise<{ success: boolean; data: T; error?: string; message?: string }>;

const BASE = '/facturas-colaborador';

const query = (f: Record<string, unknown>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== null && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

/** El formulario de subida: archivo, importe y número de factura. */
const subida = (archivo: File, importe: string, numeroFactura: string) => {
  const fd = new FormData();
  fd.append('archivo', archivo);
  fd.append('importe', importe);
  fd.append('numero_factura', numeroFactura);
  return fd;
};

export const facturasColaboradorApi = {
  // ── Administración: la lista de colaboradores ──
  empresas: () => client.get(`${BASE}/empresas`) as R<EmpresaDelGrupo[]>,
  colaboradores: (f: { estado?: 'activos' | 'de_baja' | 'todos'; issuerId?: number; q?: string } = {}) =>
    client.get(`${BASE}/colaboradores${query(f)}`) as R<Colaborador[]>,
  crear: (b: ColaboradorEnvio) => client.post(`${BASE}/colaboradores`, b) as R<Colaborador>,
  editar: (id: number, b: Partial<ColaboradorEnvio>) => client.patch(`${BASE}/colaboradores/${id}`, b) as R<Colaborador>,
  darDeBaja: (id: number, desde: string) => client.post(`${BASE}/colaboradores/${id}/baja`, { desde }) as R<Colaborador>,
  volverDeAlta: (id: number, desde: string) => client.post(`${BASE}/colaboradores/${id}/alta`, { desde }) as R<Colaborador>,
  registroDelColaborador: (id: number) => client.get(`${BASE}/colaboradores/${id}/registro`) as R<LineaRegistro[]>,

  // ── Administración: las facturas del mes ──
  mes: (f: { periodo: string; issuerId?: number; estado?: EstadoFactura; area?: Area }) =>
    client.get(`${BASE}/mes${query(f)}`) as R<Mes>,
  archivo: (id: number) => client.get(`${BASE}/facturas/${id}/archivo`) as R<{ url: string; nombre: string | null }>,
  registroDeLaFactura: (id: number) => client.get(`${BASE}/facturas/${id}/registro`) as R<LineaRegistro[]>,
  anular: (id: number, motivo: string) => client.post(`${BASE}/facturas/${id}/anular`, { motivo }) as R<{ anulada: number; nueva: number }>,
  reenviar: (id: number) => client.post(`${BASE}/facturas/${id}/reenviar`, {}) as R<{ id: number }>,

  // ── El enlace del colaborador (sin usuario) ──
  verEnlace: (token: string) => client.get(`${BASE}/enlace/${token}`) as R<FacturaDelColaborador>,
  subirPorEnlace: (token: string, archivo: File, importe: string, numeroFactura: string) =>
    client.post(`${BASE}/enlace/${token}`, subida(archivo, importe, numeroFactura)) as R<FacturaDelColaborador>,

  // ── «Mi factura» (colaborador con usuario) ──
  mias: () => client.get(`${BASE}/mias`) as R<FacturaDelColaborador[]>,
  subirMia: (id: number, archivo: File, importe: string, numeroFactura: string) =>
    client.post(`${BASE}/mias/${id}`, subida(archivo, importe, numeroFactura)) as R<FacturaDelColaborador>,
  archivoMio: (id: number) => client.get(`${BASE}/mias/${id}/archivo`) as R<{ url: string; nombre: string | null }>,
};

// ── Formato compartido por las pantallas ──

/**
 * «CEDIA Investigación y Desarrollo SL» → «CEDIA», para las tablas (como la
 * maqueta de Diego: «CEDIA · ICTESS»). El nombre entero va en el `title`.
 */
export const empresaCorta = (razonSocial: string) => String(razonSocial || '').trim().split(/[\s,]+/)[0] || razonSocial;

/** Solo la primera letra en mayúscula: «Septiembre de 2026», no «Septiembre De 2026» (lo que hace `capitalize`). */
export const primeraMayuscula = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/**
 * El importe tal como lo escribe la persona, a número (texto con punto decimal).
 *   «1.234,56», «1,234.56» → con los dos, el decimal es el que va último.
 *   «600,50», «12,500»     → solo coma: es el decimal (12,5).
 *   «1.200», «12.500»      → solo punto y separa grupos de tres: miles.
 *   «600.50», «600»        → si no, el punto es el decimal.
 * Aquí sirve para avisar en pantalla; al servidor se le manda lo escrito tal cual.
 */
export function normalizarImporte(texto: string): string {
  const t = texto.trim().replace(/\s|€/g, '');
  const coma = t.lastIndexOf(',');
  const punto = t.lastIndexOf('.');
  // Con los dos, el decimal es el que va último: «1.234,56» y «1,234.56».
  if (coma >= 0 && punto >= 0) {
    return coma > punto ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  }
  if (coma >= 0) return t.replace(',', '.');
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return t.replace(/\./g, '');
  return t;
}

// `useGrouping: 'always'`: sin él, «1150,00» (en español el punto de miles solo
// sale desde cinco cifras) y la maqueta dice «3.600,00 €». Los tipos de
// TypeScript del proyecto aún no lo conocen; los navegadores, sí.
const FORMATO_EUROS = {
  minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always',
} as unknown as Intl.NumberFormatOptions;

export const euros = (n: number | string | null | undefined) =>
  n === null || n === undefined || n === '' ? '—' : `${Number(n).toLocaleString('es-ES', FORMATO_EUROS)} €`;

export const fechaHora = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

export const diaMes = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Estado de la factura: texto y tono, con los tokens del CRM (#32). */
export const ESTADO: Record<EstadoFactura, { rotulo: string; clase: string }> = {
  sin_enviar: { rotulo: 'Sin enviar', clase: 'bg-muted text-muted-foreground' },
  enviado: { rotulo: 'Enviado', clase: 'bg-info-soft text-info-soft-foreground' },
  abierto: { rotulo: 'Abierto', clase: 'bg-info-soft text-info-soft-foreground' },
  recibida: { rotulo: 'Recibida', clase: 'bg-success-soft text-success-soft-foreground' },
  anulada: { rotulo: 'Anulada', clase: 'bg-destructive-soft text-destructive-soft-foreground' },
  no_enviado: { rotulo: 'No enviado (error)', clase: 'bg-destructive-soft text-destructive-soft-foreground' },
  caducado: { rotulo: 'Caducado', clase: 'bg-warning-soft text-warning-soft-foreground' },
};
