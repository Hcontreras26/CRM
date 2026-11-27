import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowsClockwise, ArrowRight, ChartLineUp, FileCsv, Info, MagnifyingGlass, PlugsConnected, Warning,
} from '@phosphor-icons/react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useCampusDeLaPantalla } from '@/shared/hooks/useCampusDeLaPantalla';
import ElegirCampus from '@/shared/components/ui/ElegirCampus';
import usePermission from '@/shared/hooks/usePermission';
import { toast } from '@/shared/hooks/useToast';
import {
  googleAnalyticsApi, type Embudo, type EstadoCampus, type PaginaGA,
} from '../api/googleAnalytics.api';

/**
 * Google Analytics: lo que pasa antes del lead (CRM#55).
 *
 * Arriba, el embudo del periodo en una línea: sesiones → prospectos → ventas.
 * Debajo, las sesiones por día (una sola serie: sesiones y prospectos tienen
 * escalas muy distintas y no comparten eje; los prospectos del día van en el
 * tooltip), el reparto por canal de GA4 y, lo que pide la issue, cada página de
 * entrada con sus visitas y sus prospectos: separa «nadie entra» de «entran y
 * no piden».
 *
 * Es de UN campus (cada uno tiene su propiedad de GA4), como Meta Ads.
 */

const num = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('es-ES').format(n));
const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const hace = (dias: number) => iso(new Date(Date.now() - dias * 86400000));
const diaCorto = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const cuando = (s: string | null) => (s ? new Date(s).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : 'nunca');

// Los nombres de canal de GA4 (sessionDefaultChannelGroup), en español.
const CANAL: Record<string, string> = {
  'Organic Search': 'Búsqueda orgánica', 'Paid Search': 'Búsqueda de pago', Direct: 'Directo',
  'Organic Social': 'Redes (orgánico)', 'Paid Social': 'Redes (pago)', Referral: 'Referidos',
  Email: 'Email', 'Organic Video': 'Vídeo (orgánico)', 'Paid Video': 'Vídeo (pago)', Display: 'Display',
  'Cross-network': 'Varias redes', 'Organic Shopping': 'Shopping (orgánico)', 'Paid Shopping': 'Shopping (pago)',
  Affiliates: 'Afiliados', 'SMS': 'SMS', 'Mobile Push Notifications': 'Notificaciones', Unassigned: 'Sin asignar',
  'Paid Other': 'Otros de pago', '(not set)': 'Sin dato',
};
const canal = (c: string) => CANAL[c] || c;

/**
 * El diagnóstico de una página. Umbrales deliberadamente prudentes: con pocas
 * visitas no se dice nada, porque 0 prospectos de 12 visitas no prueba nada.
 */
const MIN_SESIONES = 100;
type Diagnostico = { texto: string; tono: 'bien' | 'aviso' | 'neutro'; por: string };
function diagnosticar(p: PaginaGA, media: number | null): Diagnostico | null {
  if (p.sesiones < MIN_SESIONES) {
    return p.leads > 0
      ? null
      : { texto: 'Poca visita', tono: 'neutro', por: `Menos de ${MIN_SESIONES} visitas: el problema es que no la ven (publicidad, posicionamiento).` };
  }
  if (media == null || p.lead_por_sesion == null) return null;
  if (p.lead_por_sesion < media / 2) {
    return { texto: 'Entran y no piden', tono: 'aviso', por: `Convierte ${pct(p.lead_por_sesion)}, menos de la mitad que la media del campus (${pct(media)}): el problema es la página.` };
  }
  if (p.lead_por_sesion >= media * 1.5) {
    return { texto: 'Convierte bien', tono: 'bien', por: `Convierte ${pct(p.lead_por_sesion)}, por encima de la media del campus (${pct(media)}).` };
  }
  return null;
}
const TONO = {
  bien: 'bg-success-soft text-success-soft-foreground',
  aviso: 'bg-warning-soft text-warning-soft-foreground',
  neutro: 'bg-muted text-muted-foreground',
};

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 min-w-0">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-2xl font-semibold tabular-nums tracking-tight">{valor}</p>
      {detalle && <p className="text-[11px] text-muted-foreground mt-0.5">{detalle}</p>}
    </div>
  );
}

function Paso({ valor, texto }: { valor: string; texto: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-2 text-muted-foreground" aria-hidden="true">
      <ArrowRight size={16} />
      <span className="text-[11px] tabular-nums font-semibold text-foreground">{valor}</span>
      <span className="text-[10px]">{texto}</span>
    </div>
  );
}

function TooltipDia({ active, payload }: { active?: boolean; payload?: Array<{ payload: Embudo['dias'][number] }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold mb-1">{diaCorto(d.fecha)}</p>
      <p>Sesiones: <span className="tabular-nums font-semibold">{d.sesiones == null ? 'sin dato de GA4' : num(d.sesiones)}</span></p>
      <p>Prospectos: <span className="tabular-nums font-semibold">{num(d.leads)}</span></p>
      <p>Ventas: <span className="tabular-nums font-semibold">{num(d.ventas)}</span></p>
    </div>
  );
}

export default function GoogleAnalyticsPage() {
  const campus = useCampusDeLaPantalla();
  const projectId = campus.id;
  const { can } = usePermission();
  const puedeSincronizar = can('google_analytics.edit');

  const [desde, setDesde] = useState(hace(30));
  const [hasta, setHasta] = useState(hace(1));
  const [estados, setEstados] = useState<EstadoCampus[] | null>(null);
  const [syncActivo, setSyncActivo] = useState(false);
  const [embudo, setEmbudo] = useState<Embudo | null>(null);
  const [paginas, setPaginas] = useState<PaginaGA[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [filtro, setFiltro] = useState('');

  const cargarEstado = useCallback(() => {
    googleAnalyticsApi.estado()
      .then((e) => { setEstados(e?.campus || []); setSyncActivo(Boolean(e?.activo)); })
      .catch(() => setEstados([]));
  }, []);
  useEffect(() => { cargarEstado(); }, [cargarEstado]);

  const estado = useMemo(() => estados?.find((e) => e.project_id === projectId) || null, [estados, projectId]);
  const conectado = Boolean(estado);

  useEffect(() => {
    if (!projectId || !conectado || desde > hasta) return undefined;
    let vivo = true;
    setCargando(true); setError(null);
    Promise.all([
      googleAnalyticsApi.embudo(projectId, desde, hasta),
      googleAnalyticsApi.paginas(projectId, desde, hasta),
    ])
      .then(([e, p]) => { if (vivo) { setEmbudo(e); setPaginas(p || []); } })
      .catch((err: { data?: { error?: string }; message?: string }) => {
        if (vivo) setError(err?.data?.error || err?.message || 'No se pudo cargar');
      })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [projectId, conectado, desde, hasta, estado?.last_synced_at]);

  async function sincronizar() {
    if (!projectId) return;
    setSincronizando(true);
    try {
      const r = await googleAnalyticsApi.sincronizar(projectId);
      toast({ title: 'Google Analytics al día', description: `Traídos los últimos ${r?.dias ?? ''} días.` });
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      toast({ title: 'No se pudo sincronizar', description: e?.data?.error || e?.message, variant: 'destructive' });
    } finally {
      setSincronizando(false);
      cargarEstado();
    }
  }

  const media = embudo?.total.lead_por_sesion ?? null;
  const filas = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return f ? paginas.filter((p) => p.pagina.includes(f)) : paginas;
  }, [paginas, filtro]);
  const totalSesionesCanal = useMemo(() => (embudo?.canales || []).reduce((t, c) => t + c.sesiones, 0), [embudo]);

  function descargar() {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const cab = ['Página', 'Sesiones', 'Usuarios', 'Eventos clave (GA4)', 'Prospectos', 'Ventas', '% prospecto por sesión', 'Diagnóstico'];
    const lineas = [cab.map(esc).join(';')];
    for (const p of filas) {
      const d = diagnosticar(p, media);
      lineas.push([p.pagina, p.sesiones, p.usuarios, p.eventos_clave, p.leads, p.ventas,
        p.lead_por_sesion == null ? '' : String(p.lead_por_sesion).replace('.', ','), d?.texto || ''].map(esc).join(';'));
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${lineas.join('\n')}`], { type: 'text/csv;charset=utf-8;' }));
    a.download = `paginas-ga4-${campus.nombre || projectId}-${desde}_${hasta}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }

  const selector = <ElegirCampus campus={campus} que="sus visitas" />;

  if (!projectId) {
    return <div className="space-y-3">{selector}<p className="text-sm text-muted-foreground">Elige un campus para ver sus visitas.</p></div>;
  }
  if (estados === null) return <div className="space-y-3">{selector}<div className="h-40 rounded-lg bg-muted/40 animate-pulse" /></div>;

  if (!conectado) {
    return (
      <div className="space-y-3">
        {selector}
        <section className="rounded-lg border border-border bg-card p-5 max-w-2xl">
          <h2 className="text-base font-semibold flex items-center gap-2"><PlugsConnected size={18} /> {campus.nombre || 'Este campus'} no tiene Google Analytics conectado</h2>
          <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground list-decimal pl-5">
            <li>En Google Cloud, crea una cuenta de servicio y descarga su clave en JSON.</li>
            <li>En GA4, en <em>Administrar › Gestión del acceso a la propiedad</em>, da a su correo el rol <strong>Lector</strong>.</li>
            <li>Añade al JSON <code className="text-xs">"property_id": "…"</code> con el número de la propiedad (no el «G-…» de la web).</li>
            <li>Guárdalo en <Link to="/configuracion/claves" className="text-primary underline">Configuración › Claves</Link> como <strong>Google Analytics 4</strong> de este campus y pulsa «Probar».</li>
          </ol>
        </section>
      </div>
    );
  }

  const t = embudo?.total;

  return (
    <div className="space-y-5 pb-8">
      {selector}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            Propiedad {estado?.property_id || '—'} · Última sincronización: {cuando(estado?.last_synced_at || null)}
            {!(estado?.sync_activa ?? syncActivo) && ' · la sincronización automática de este campus está apagada (se enciende en Integraciones)'}
          </p>
          {estado?.last_status === 'error' && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive" role="alert">
              <Warning size={14} weight="bold" className="mt-0.5 shrink-0" /> La última vez falló: {estado.last_error}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-xs text-muted-foreground">Desde
            <input type="date" value={desde} max={hasta} onChange={(e) => setDesde(e.target.value)}
              className="block h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground" />
          </label>
          <label className="text-xs text-muted-foreground">Hasta
            <input type="date" value={hasta} min={desde} onChange={(e) => setHasta(e.target.value)}
              className="block h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground" />
          </label>
          {puedeSincronizar && (
            <button type="button" onClick={sincronizar} disabled={sincronizando}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-semibold hover:bg-muted disabled:opacity-50">
              <ArrowsClockwise size={14} weight="bold" className={sincronizando ? 'animate-spin' : ''} />
              {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
          )}
        </div>
      </div>

      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : cargando && !embudo ? (
        <div className="h-64 rounded-lg bg-muted/40 animate-pulse" />
      ) : embudo && t ? (
        <>
          {/* El embudo en una línea (subfase 4) */}
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto_1fr] gap-2 items-stretch">
            <Cifra titulo="Sesiones" valor={num(t.sesiones)} detalle={t.sesiones == null ? 'GA4 no tiene datos de este periodo' : 'Visitas a la web, de GA4'} />
            <Paso valor={pct(t.lead_por_sesion)} texto="piden información" />
            <Cifra titulo="Prospectos" valor={num(t.leads)} detalle="Entraron en el CRM en el periodo" />
            <Paso valor={pct(t.venta_por_lead)} texto="compran" />
            <Cifra titulo="Ventas" valor={num(t.ventas)} detalle="De esos prospectos, con algún cobro" />
          </div>

          {/* Sesiones por día */}
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><ChartLineUp size={16} /> Sesiones por día</h2>
            <p className="text-[11px] text-muted-foreground mb-2">Pasa el ratón por un día para ver sus prospectos y ventas. Un hueco es un día sin dato de GA4, no un cero.</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={embudo.dias} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="fecha" tickFormatter={diaCorto} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<TooltipDia />} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeDasharray: '3 3' }} />
                  <Line type="monotone" dataKey="sesiones" name="Sesiones" stroke="hsl(var(--primary))" strokeWidth={2}
                    dot={false} activeDot={{ r: 5, stroke: 'hsl(var(--card))', strokeWidth: 2 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            {/* Por canal */}
            <section className="rounded-lg border border-border bg-card p-4 min-w-0">
              <h2 className="text-sm font-semibold mb-1">Por dónde llegan</h2>
              <p className="text-[11px] text-muted-foreground mb-3">Canal de la sesión según GA4.</p>
              {embudo.canales.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin sesiones en el periodo.</p>
              ) : (
                <ul className="space-y-2">
                  {embudo.canales.map((c) => (
                    <li key={c.canal} className="text-xs">
                      <div className="flex justify-between gap-2">
                        <span className="truncate">{canal(c.canal)}</span>
                        <span className="tabular-nums text-muted-foreground">{num(c.sesiones)}</span>
                      </div>
                      <span className="mt-1 block h-1.5 rounded-full bg-primary/70"
                        style={{ width: `${Math.max(2, (c.sesiones / Math.max(1, totalSesionesCanal)) * 100)}%` }} />
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Por página (subfase 3) */}
            <section className="rounded-lg border border-border bg-card p-4 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <h2 className="text-sm font-semibold">Por página de entrada</h2>
                  <p className="text-[11px] text-muted-foreground max-w-xl">
                    Si un curso no vende: ¿nadie entra en su página o entran y no piden información? Los prospectos se
                    cuentan por la página por la que llegaron al formulario.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="relative">
                    <span className="sr-only">Buscar página</span>
                    <MagnifyingGlass size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="/curso/…"
                      className="h-8 w-40 rounded-md border border-border bg-card pl-7 pr-2 text-xs" />
                  </label>
                  <button type="button" onClick={descargar} disabled={!filas.length}
                    className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-semibold hover:bg-muted disabled:opacity-40">
                    <FileCsv size={14} weight="bold" /> CSV
                  </button>
                </div>
              </div>
              {filas.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">No hay páginas en el periodo.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] whitespace-nowrap">
                    <thead className="bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold">Página</th>
                        <th className="px-3 py-2 text-right font-bold">Sesiones</th>
                        <th className="px-3 py-2 text-right font-bold">Prospectos</th>
                        <th className="px-3 py-2 text-right font-bold" title="Prospectos por cada 100 sesiones">% piden</th>
                        <th className="px-3 py-2 text-right font-bold">Ventas</th>
                        <th className="px-3 py-2 text-left font-bold">Diagnóstico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((p) => {
                        const d = diagnosticar(p, media);
                        return (
                          <tr key={p.pagina} className="border-b border-border/50 hover:bg-muted/40">
                            <td className="px-3 py-1.5 font-mono truncate max-w-[280px]" title={p.pagina}>{p.pagina}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{num(p.sesiones)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{num(p.leads)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{pct(p.lead_por_sesion)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{num(p.ventas)}</td>
                            <td className="px-3 py-1.5">
                              {d && <span className={`rounded px-1.5 py-px text-[10px] font-semibold ${TONO[d.tono]}`} title={d.por}>{d.texto}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                <Info size={12} className="mt-0.5 shrink-0" />
                El diagnóstico compara con la media del campus ({pct(media)}) y solo opina con {MIN_SESIONES} sesiones o más.
              </p>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
