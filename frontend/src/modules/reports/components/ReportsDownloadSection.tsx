// Sección de reportes descargables. Rango de fechas arriba + una tarjeta por
// reporte con botones Excel/CSV. Cada tarjeta pega a /reports/<key> y arma el
// archivo en el navegador (Excel con write-excel-file, CSV manual).
import { useState, useEffect } from 'react';
import { DownloadSimple, FileXls, FileCsv, CalendarBlank, ChartBar, UsersThree, Receipt, ListChecks, Invoice, Trophy, Eye, X } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';
import { ponerAmbito } from '@/shared/lib/ambitoInforme';

type ColType = 'string' | 'number' | 'date' | 'estado';
interface Col { h: string; k: string; t?: ColType }
interface ReportDef { key: string; label: string; desc: string; icon: React.ElementType; cols: Col[] }

const ESTADO: Record<string, string> = {
  nuevo: 'Nuevo', por_contactar: 'Por contactar', contactado: 'Contactado',
  en_seguimiento: 'En seguimiento', convertido: 'Convertido', no_interesado: 'No interesado',
  proxima_convocatoria: 'Próxima convocatoria',
};

const REPORTS: ReportDef[] = [
  {
    key: 'resumen-mensual', label: 'Resumen mensual', icon: ChartBar,
    desc: 'Por mes: prospectos entrados, convertidos, tasa de conversión, ventas y cobrado.',
    cols: [
      { h: 'Mes', k: 'mes' }, { h: 'Prospectos', k: 'prospectos', t: 'number' },
      { h: 'Convertidos', k: 'convertidos', t: 'number' }, { h: 'Tasa %', k: 'tasa_conversion', t: 'number' },
      { h: 'Ventas €', k: 'ventas', t: 'number' }, { h: 'Cobrado €', k: 'cobrado', t: 'number' },
    ],
  },
  {
    key: 'prospectos', label: 'Prospectos', icon: UsersThree,
    desc: 'Prospectos por fecha de entrada, con el valor estimado del producto de interés.',
    cols: [
      { h: 'Proyecto', k: 'proyecto' }, { h: 'Nombre', k: 'nombre' }, { h: 'Teléfono', k: 'telefono' },
      { h: 'Email', k: 'email' }, { h: 'Estado', k: 'estado', t: 'estado' }, { h: 'Producto', k: 'producto' },
      { h: 'Valor estimado', k: 'valor_estimado', t: 'number' }, { h: 'Responsable', k: 'responsable' },
      { h: 'Fecha entrada', k: 'fecha_entrada', t: 'date' },
    ],
  },
  {
    key: 'ventas', label: 'Ventas (conversiones)', icon: Receipt,
    desc: 'Una fila por venta, según su fecha de conversión. No incluye cuotas ni abonos como ventas adicionales.',
    cols: [
      { h: 'Fecha venta', k: 'fecha_venta', t: 'date' }, { h: 'Cliente', k: 'cliente' },
      { h: 'Formación', k: 'formacion' }, { h: 'Venta total €', k: 'venta_total', t: 'number' },
      { h: 'Cobrado €', k: 'cobrado', t: 'number' }, { h: 'Pendiente €', k: 'pendiente', t: 'number' },
      { h: 'Estado pago', k: 'estado_pago' }, { h: 'Estado lead', k: 'estado', t: 'estado' },
      { h: 'Responsable', k: 'responsable' }, { h: 'País', k: 'pais' },
      { h: 'Método', k: 'metodo_pago' }, { h: 'Proyecto', k: 'proyecto' },
    ],
  },
  {
    key: 'general', label: 'General (todos los contactos)', icon: ListChecks,
    desc: 'Todos: prospectos y convertidos. Valor estimado en prospectos e importe real en clientes.',
    cols: [
      { h: 'Proyecto', k: 'proyecto' }, { h: 'Nombre', k: 'nombre' }, { h: 'Teléfono', k: 'telefono' },
      { h: 'Estado', k: 'estado', t: 'estado' }, { h: 'País', k: 'pais' },
      { h: 'Producto interés', k: 'producto_interes' }, { h: 'Valor estimado', k: 'valor_estimado', t: 'number' },
      { h: 'Producto contratado', k: 'producto_contratado' }, { h: 'Venta total', k: 'venta_total', t: 'number' },
      { h: 'Cobrado', k: 'venta_cobrado', t: 'number' }, { h: 'Pendiente', k: 'venta_pendiente', t: 'number' },
      { h: 'Método', k: 'metodo_pago' }, { h: 'Responsable', k: 'responsable' },
      { h: 'Fecha entrada', k: 'fecha_entrada', t: 'date' },
      { h: 'Fecha venta', k: 'fecha_venta', t: 'date' },
    ],
  },
  {
    key: 'ventas-vendedora', label: 'Ventas por vendedora', icon: Trophy,
    desc: 'Ventas agrupadas por el responsable del lead: nº de ventas, clientes, total, cobrado y pendiente.',
    cols: [
      { h: 'Vendedora', k: 'vendedora' }, { h: 'Ventas', k: 'ventas', t: 'number' },
      { h: 'Clientes', k: 'clientes', t: 'number' }, { h: 'Total €', k: 'total', t: 'number' },
      { h: 'Cobrado €', k: 'cobrado', t: 'number' }, { h: 'Pendiente €', k: 'pendiente', t: 'number' },
    ],
  },
  {
    key: 'ventas-asesora', label: 'Ventas por asesora (detalle)', icon: Trophy,
    desc: 'Una fila por venta con su asesora, la fecha, el cliente y sus datos de contacto, el importe y como va el cobro.',
    cols: [
      { h: 'Asesora', k: 'asesora' }, { h: 'Fecha venta', k: 'fecha_venta', t: 'date' },
      { h: 'Cliente', k: 'cliente' }, { h: 'Email', k: 'cliente_email' },
      { h: 'Telefono', k: 'cliente_telefono' }, { h: 'Pais', k: 'pais' },
      { h: 'Formacion', k: 'formacion' }, { h: 'Venta total EUR', k: 'venta_total', t: 'number' },
      { h: 'Cobrado EUR', k: 'cobrado', t: 'number' }, { h: 'Pendiente EUR', k: 'pendiente', t: 'number' },
      { h: 'Estado pago', k: 'estado_pago' }, { h: 'Metodo', k: 'metodo_pago' },
      { h: 'N cobros', k: 'num_cobros', t: 'number' },
      { h: 'Cuotas pendientes', k: 'cuotas_pendientes', t: 'number' },
      { h: 'N facturas', k: 'facturas', t: 'number' },
      { h: 'Estado lead', k: 'estado_lead', t: 'estado' },
      { h: 'Fecha entrada', k: 'fecha_entrada', t: 'date' }, { h: 'Proyecto', k: 'proyecto' },
    ],
  },
  {
    key: 'asesoras-mes', label: 'Asesoras por mes', icon: UsersThree,
    desc: 'Por asesora y mes: leads que le entraron, ventas cerradas, tasa de conversion, lo vendido y lo cobrado ese mes.',
    cols: [
      { h: 'Mes', k: 'mes' }, { h: 'Asesora', k: 'asesora' },
      { h: 'Leads', k: 'leads', t: 'number' }, { h: 'Ventas', k: 'ventas', t: 'number' },
      { h: 'Mensualidades cobradas', k: 'mensualidades', t: 'number' },
      { h: 'Clientes', k: 'clientes', t: 'number' },
      { h: 'Tasa conversion %', k: 'tasa_conversion', t: 'number' },
      { h: 'Vendido EUR', k: 'vendido', t: 'number' }, { h: 'Cobrado EUR', k: 'cobrado', t: 'number' },
      { h: 'Cobrado de ventas EUR', k: 'cobrado_venta', t: 'number' },
      { h: 'Cobrado de cuotas EUR', k: 'cobrado_cuotas', t: 'number' },
      { h: 'Ticket medio EUR', k: 'ticket_medio', t: 'number' },
    ],
  },
  {
    key: 'paises', label: 'Países', icon: ChartBar,
    desc: 'Ventas por país, deducido del prefijo del teléfono. La columna de país fiscal no sirve: casi todos los leads tienen España por defecto.',
    cols: [
      { h: 'País', k: 'pais' }, { h: 'Ventas', k: 'ventas', t: 'number' },
      { h: 'Clientes', k: 'clientes', t: 'number' },
      { h: 'Vendido EUR', k: 'vendido', t: 'number' },
      { h: 'Cobrado EUR', k: 'cobrado', t: 'number' },
    ],
  },
  {
    key: 'formaciones', label: 'Formaciones más vendidas', icon: ListChecks,
    desc: 'Ranking de formaciones. Cada fila dice si viene del catálogo o de texto tecleado a mano.',
    cols: [
      { h: 'Formación', k: 'formacion' }, { h: 'Origen del dato', k: 'origen' },
      { h: 'Ventas', k: 'ventas', t: 'number' }, { h: 'Clientes', k: 'clientes', t: 'number' },
      { h: 'Vendido EUR', k: 'vendido', t: 'number' },
      { h: 'Ticket medio EUR', k: 'ticket_medio', t: 'number' },
    ],
  },
  {
    key: 'general-facturacion', label: 'General + Facturación', icon: Invoice,
    desc: 'Lo mismo que el general, más lo facturado (nº de facturas e importe facturado).',
    cols: [
      { h: 'Proyecto', k: 'proyecto' }, { h: 'Nombre', k: 'nombre' }, { h: 'Teléfono', k: 'telefono' },
      { h: 'Estado', k: 'estado', t: 'estado' }, { h: 'Producto interés', k: 'producto_interes' },
      { h: 'Valor estimado', k: 'valor_estimado', t: 'number' }, { h: 'Producto contratado', k: 'producto_contratado' },
      { h: 'Venta total', k: 'venta_total', t: 'number' }, { h: 'Cobrado', k: 'venta_cobrado', t: 'number' },
      { h: 'Pendiente', k: 'venta_pendiente', t: 'number' }, { h: 'Nº facturas', k: 'num_facturas', t: 'number' },
      { h: 'Facturado', k: 'facturado', t: 'number' }, { h: 'Facturas', k: 'facturas' },
      { h: 'Responsable', k: 'responsable' },
      { h: 'Fecha entrada', k: 'fecha_entrada', t: 'date' }, { h: 'Fecha venta', k: 'fecha_venta', t: 'date' },
    ],
  },
];

// Fecha como texto dd/mm/aaaa (UTC para no correr el día). Así Excel la muestra
// completa y no la reinterpreta como 'jul-26' según el locale.
function fmtDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  const d = new Date(v as string);
  if (Number.isNaN(d.getTime())) return String(v);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

// Columnas donde un valor vacío significa "sin asignar" (responsable/vendedora).
const SIN_ASIGNAR = new Set(['responsable', 'vendedora']);

function scalar(c: Col, row: Record<string, unknown>): string | number | null {
  const v = row[c.k];
  if (v == null || v === '') return SIN_ASIGNAR.has(c.k) ? 'Sin asignar' : null;
  if (c.t === 'number') { const n = Number(v); return Number.isNaN(n) ? null : n; }
  if (c.t === 'date') return fmtDate(v);
  if (c.t === 'estado') return ESTADO[v as string] || String(v);
  return String(v);
}

function csvCell(c: Col, row: Record<string, unknown>) {
  const v = row[c.k];
  if (v == null || v === '') return SIN_ASIGNAR.has(c.k) ? 'Sin asignar' : '';
  if (c.t === 'estado') return ESTADO[v as string] || String(v);
  if (c.t === 'date') return fmtDate(v) || '';
  return String(v);
}

// Texto para la vista previa (tabla en pantalla).
function cellText(c: Col, row: Record<string, unknown>): string {
  const v = row[c.k];
  if (v == null || v === '') return SIN_ASIGNAR.has(c.k) ? 'Sin asignar' : '—';
  if (c.t === 'estado') return ESTADO[v as string] || String(v);
  if (c.t === 'date') return fmtDate(v) || '—';
  if (c.t === 'number') { const n = Number(v); return Number.isNaN(n) ? String(v) : n.toLocaleString('es-ES'); }
  return String(v);
}

function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsDownloadSection({ projectId, issuerId, projectName, from: desdeArriba, to: hastaArriba }: { projectId?: number; issuerId?: number | null; projectName?: string; from?: string; to?: string }) {
  // El rango lo manda la cabecera de la pagina: aqui no se elige aparte.
  const from = desdeArriba || '';
  const to = hastaArriba || '';
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ report: ReportDef; rows: Record<string, unknown>[]; base: string } | null>(null);
  const [bajandoTodo, setBajandoTodo] = useState(false);
  // Lo que el informe «por factura» va a dejar fuera. Se pregunta ANTES de
  // descargar: una venta cobrada y aun sin facturar no aparece —el informe
  // cuenta por fecha de factura— y quien descarga se lleva un total mas bajo
  // sin enterarse. Paso el fin de semana del 15 y 16 de agosto.
  const [aviso, setAviso] = useState<{ ventas: number; importe: number; detalle: Array<{ id: number; cliente: string; cobrado: string; ultimo_cobro: string; curso: string }> } | null>(null);
  const [pendiente, setPendiente] = useState<null | (() => void)>(null);
  const [comprobando, setComprobando] = useState(false);

  // Devuelve true si se puede seguir; si hay ventas sin facturar, abre el aviso
  // y deja la descarga en espera de que la persona decida.
  async function comprobarAntes(seguir: () => void) {
    if (!from || !to) { seguir(); return; }
    setComprobando(true);
    try {
      const p0 = new URLSearchParams({ from, to });
      ponerAmbito(p0, { activeIssuerId: issuerId, activeProject: { id: projectId } });
      const r = await client.get(`/informes/aviso-sin-factura?${p0.toString()}`);
      const d = r?.success ? r.data : null;
      if (d && d.ventas > 0) { setAviso(d); setPendiente(() => seguir); return; }
    } catch { /* si la comprobacion falla no se bloquea la descarga */ }
    finally { setComprobando(false); }
    seguir();
  }

  // Todo junto, una hoja por bloque. Es lo que se pide cuando alguien quiere
  // mirar los numeros fuera del CRM sin ir juntando ficheros sueltos.
  async function bajarTodo() {
    setBajandoTodo(true);
    try {
      const { descargarReportePrincipal } = await import('@/shared/lib/reportePrincipal');
      const r = await descargarReportePrincipal({ projectId, issuerId, projectName, from, to });
      if (!r.nombre) { toast({ title: 'Sin datos en ese período' }); return; }
      toast({ title: 'Reporte principal descargado', description: `${r.hojas} hojas · ${r.nombre}` });
    } catch (err) {
      toast({ title: 'No se pudo generar el reporte', description: (err as Error)?.message, variant: 'destructive' });
    } finally { setBajandoTodo(false); }
  }
  const ready = Boolean(from && to);

  async function fetchRows(report: ReportDef): Promise<{ rows: Record<string, unknown>[]; base: string }> {
    const dFrom = from && to && from > to ? to : from;
    const dTo = from && to && from > to ? from : to;
    const p = new URLSearchParams();
    ponerAmbito(p, { activeIssuerId: issuerId, activeProject: { id: projectId } });
    if (dFrom) p.set('from', dFrom);
    if (dTo) p.set('to', dTo);
    const res = await client.get(`/informes/${report.key}?${p.toString()}`);
    const rows: Record<string, unknown>[] = (res as { data?: Record<string, unknown>[] }).data || [];
    const sufijo = dFrom || dTo ? `${dFrom || 'inicio'}_${dTo || 'hoy'}` : 'todo';
    return { rows, base: `${report.key}-${projectName || 'crm'}-${sufijo}` };
  }

  async function openPreview(report: ReportDef) {
    setBusy(`${report.key}:preview`);
    try {
      const { rows, base } = await fetchRows(report);
      if (!rows.length) { toast({ title: 'Sin datos en ese período', description: report.label }); return; }
      setPreview({ report, rows, base });
    } catch (err) {
      toast({ title: 'No se pudo cargar la vista previa', description: (err as { message?: string })?.message, variant: 'destructive' });
    } finally { setBusy(null); }
  }

  async function run(report: ReportDef, format: 'xlsx' | 'csv', preloaded?: { rows: Record<string, unknown>[]; base: string }) {
    setBusy(`${report.key}:${format}`);
    try {
      const { rows, base } = preloaded || await fetchRows(report);
      if (!rows.length) { toast({ title: 'Sin datos en ese período', description: report.label }); return; }
      if (format === 'xlsx') {
        const writeXlsxFile = (await import('write-excel-file/browser')).default as unknown as (
          objs: unknown[], opts: Record<string, unknown>,
        ) => { toFile: (n: string) => Promise<void> };
        const columns = report.cols.map((c) => ({
          width: c.t === 'date' ? 13 : c.t === 'number' ? 12 : Math.min(42, Math.max(12, c.h.length + 2)),
          header: { value: c.h, type: String, fontWeight: 'bold' as const },
          cell: (row: Record<string, unknown>) => {
            const s = scalar(c, row);
            if (s == null) return null;
            return { value: s, type: c.t === 'number' ? Number : String };
          },
        }));
        await writeXlsxFile(rows, { columns, sheet: 'Datos', dateFormat: 'yyyy-mm-dd' }).toFile(`${base}.xlsx`);
      } else {
        const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
        const head = report.cols.map((c) => esc(c.h)).join(',');
        const body = rows.map((r) => report.cols.map((c) => esc(csvCell(c, r))).join(',')).join('\n');
        downloadBlob(new Blob(['﻿' + head + '\n' + body], { type: 'text/csv;charset=utf-8;' }), `${base}.csv`);
      }
      toast({ title: 'Descarga lista', description: `${report.label}: ${rows.length} fila${rows.length === 1 ? '' : 's'}.` });
    } catch (err) {
      toast({ title: 'No se pudo generar el reporte', description: (err as { message?: string })?.message, variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Reportes descargables</h2>
          <p className="text-xs text-muted-foreground">
            Usan el mismo rango de fechas que has elegido arriba. Descarga en Excel o CSV.
          </p>
        </div>
        <button
          type="button"
          onClick={() => comprobarAntes(bajarTodo)}
          disabled={bajandoTodo}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50"
          title="Un solo Excel con resumen, evolución, asesoras, países, formaciones y el detalle de ventas"
        >
          <DownloadSimple size={16} weight="bold" />
          {comprobando ? 'Comprobando…' : bajandoTodo ? 'Generando…' : 'Descargar reporte principal'}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <div key={r.key} className="flex flex-col rounded-lg border border-border bg-background/40 p-3">
              <div className="flex items-start gap-2">
                <div className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Icon size={16} weight="regular" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-foreground">{r.label}</h3>
                  <p className="text-[11px] leading-snug text-muted-foreground">{r.desc}</p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button type="button" disabled={busy !== null || !ready} onClick={() => openPreview(r)}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-60 text-xs font-medium">
                  <Eye size={13} weight="bold" /> {busy === `${r.key}:preview` ? 'Cargando…' : 'Vista previa'}
                </button>
                <button type="button" disabled={busy !== null || !ready} onClick={() => comprobarAntes(() => run(r, 'xlsx'))}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 text-xs font-semibold">
                  <FileXls size={13} weight="bold" /> {busy === `${r.key}:xlsx` ? 'Generando…' : 'Excel'}
                </button>
                <button type="button" disabled={busy !== null || !ready} onClick={() => comprobarAntes(() => run(r, 'csv'))}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-card hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-60 text-xs font-medium">
                  <FileCsv size={13} weight="bold" /> {busy === `${r.key}:csv` ? 'Generando…' : 'CSV'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Vista previa del reporte (primeras filas) con descarga desde el modal. */}
      {preview && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
          <div role="dialog" className="relative bg-card rounded-xl border border-border w-full max-w-5xl max-h-[88vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 h-12 border-b border-border">
              <div className="min-w-0">
                <h3 className="text-sm font-bold truncate">{preview.report.label}</h3>
                <p className="text-[11px] text-muted-foreground">{preview.rows.length} fila{preview.rows.length === 1 ? '' : 's'} · mostrando las primeras {Math.min(50, preview.rows.length)}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => comprobarAntes(() => run(preview.report, 'xlsx', preview))} disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 text-xs font-semibold">
                  <FileXls size={13} weight="bold" /> Excel
                </button>
                <button onClick={() => comprobarAntes(() => run(preview.report, 'csv', preview))} disabled={busy !== null}
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-card hover:bg-muted text-xs font-medium">
                  <FileCsv size={13} weight="bold" /> CSV
                </button>
                <button onClick={() => setPreview(null)} className="p-1 rounded hover:bg-muted text-muted-foreground"><X size={16} weight="bold" /></button>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>{preview.report.cols.map((c) => <th key={c.k} className="text-left px-3 py-2 font-bold whitespace-nowrap">{c.h}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.rows.slice(0, 50).map((row, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/30">
                      {preview.report.cols.map((c) => (
                        <td key={c.k} className={`px-3 py-1.5 whitespace-nowrap ${c.t === 'number' ? 'text-right tabular-nums' : ''} ${SIN_ASIGNAR.has(c.k) && (row[c.k] == null || row[c.k] === '') ? 'text-amber-600 dark:text-amber-500 italic' : ''}`}>
                          {cellText(c, row)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {aviso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          onClick={() => { setAviso(null); setPendiente(null); }}>
          <div onClick={(e) => e.stopPropagation()}
            className="bg-card border border-border rounded-lg shadow-2xl w-full max-w-lg p-5 space-y-3">
            <h2 className="font-bold text-base">
              Hay {aviso.ventas} {aviso.ventas === 1 ? 'venta cobrada sin facturar' : 'ventas cobradas sin facturar'}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Suman <strong className="text-foreground tabular-nums">
                {Number(aviso.importe).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
              </strong> y <strong className="text-foreground">no van a salir en este informe</strong>,
              porque cuenta por la fecha de la factura. En cuanto se les emita la factura aparecerán solas.
            </p>

            <ul className="max-h-48 overflow-y-auto divide-y divide-border border border-border rounded-md text-xs">
              {aviso.detalle.map((v) => (
                <li key={v.id} className="px-3 py-1.5 flex items-center gap-2">
                  <span className="flex-1 truncate">{v.cliente}</span>
                  <span className="text-muted-foreground truncate max-w-[10rem] hidden sm:block">{v.curso}</span>
                  <span className="tabular-nums text-muted-foreground">{String(v.ultimo_cobro).slice(0, 10)}</span>
                  <span className="tabular-nums font-semibold">
                    {Number(v.cobrado).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                  </span>
                </li>
              ))}
            </ul>

            <p className="text-xs text-muted-foreground">
              Si lo que quieres es ver el dinero que entró —esté facturado o no—, descarga igual y
              consulta el informe en su vista por cobro.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setAviso(null); setPendiente(null); }}
                className="h-9 px-3 rounded-md border border-border text-sm hover:bg-muted/50">
                Cancelar
              </button>
              <button type="button"
                onClick={() => { const f = pendiente; setAviso(null); setPendiente(null); f?.(); }}
                className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold">
                Descargar igual
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
