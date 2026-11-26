import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowsClockwise, CaretDown, CaretRight, ChartLineUp, FileCsv, Info, PlugsConnected, Warning,
} from '@phosphor-icons/react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useCampusDeLaPantalla } from '@/shared/hooks/useCampusDeLaPantalla';
import { useProjectContext } from '@/contexts/ProjectContext';
import ElegirCampus from '@/shared/components/ui/ElegirCampus';
import usePermission from '@/shared/hooks/usePermission';
import { toast } from '@/shared/hooks/useToast';
import {
  googleAdsApi, type Campana, type Campanas, type Dia, type EstadoCampus, type Grupo,
} from '../api/googleAds.api';

/**
 * Google Ads: campañas y gasto en el CRM (CRM#54).
 *
 * Lo que pide la issue —«coste por venta, no por clic»— va primero: el gasto del
 * periodo y, a su lado, lo que ese gasto ha traído al CRM (prospectos, ventas,
 * cobrado) con su coste por prospecto y por venta. Debajo, el gasto por día y la
 * tabla de campañas; cada campaña se abre en sus grupos de anuncios y anuncios.
 *
 * Es de UN campus (cada uno tiene su cuenta de Google Ads), como Meta Ads. Una
 * campaña que anuncia otro campus se le puede apuntar a ese con «Campus».
 */

const num = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('es-ES').format(n));
const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const hace = (dias: number) => iso(new Date(Date.now() - dias * 86400000));
const diaCorto = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const cuando = (s: string | null) => (s ? new Date(s).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : 'nunca');

const ESTADO: Record<string, { texto: string; clase: string }> = {
  ENABLED: { texto: 'Activa', clase: 'bg-success-soft text-success-soft-foreground' },
  PAUSED: { texto: 'En pausa', clase: 'bg-muted text-muted-foreground' },
  REMOVED: { texto: 'Borrada', clase: 'bg-muted text-muted-foreground line-through' },
};
const TIPO: Record<string, string> = {
  SEARCH: 'Búsqueda', PERFORMANCE_MAX: 'Máximo rendimiento', DISPLAY: 'Display', VIDEO: 'Vídeo',
  SHOPPING: 'Shopping', DEMAND_GEN: 'Demand Gen', DISCOVERY: 'Discovery', LOCAL: 'Local', SMART: 'Inteligente',
};

function Cifra({ titulo, valor, detalle, destacada = false }: { titulo: string; valor: string; detalle?: string; destacada?: boolean }) {
  return (
    <div className={`rounded-lg border bg-card px-4 py-3 min-w-0 ${destacada ? 'border-primary/50' : 'border-border'}`}>
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-2xl font-semibold tabular-nums tracking-tight">{valor}</p>
      {detalle && <p className="text-[11px] text-muted-foreground mt-0.5">{detalle}</p>}
    </div>
  );
}

function TooltipDia({ active, payload, dinero }: { active?: boolean; payload?: Array<{ payload: Dia }>; dinero: (n: number | null) => string }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold mb-1">{diaCorto(d.fecha)}</p>
      <p>Gasto: <span className="tabular-nums font-semibold">{dinero(d.coste)}</span></p>
      <p>Clics: <span className="tabular-nums font-semibold">{num(d.clics)}</span></p>
      <p>Impresiones: <span className="tabular-nums font-semibold">{num(d.impresiones)}</span></p>
    </div>
  );
}

export default function GoogleAdsPage() {
  const campus = useCampusDeLaPantalla();
  const projectId = campus.id;
  const { projects } = useProjectContext() as { projects: Array<{ id: number; nombre: string }> };
  const { can } = usePermission();
  const puedeEditar = can('google_ads.edit');

  const [desde, setDesde] = useState(hace(30));
  const [hasta, setHasta] = useState(hace(1));
  const [estados, setEstados] = useState<EstadoCampus[] | null>(null);
  const [syncActivo, setSyncActivo] = useState(false);
  const [datos, setDatos] = useState<Campanas | null>(null);
  const [dias, setDias] = useState<Dia[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sincronizando, setSincronizando] = useState(false);
  const [abierta, setAbierta] = useState<string | null>(null);
  // Los grupos de cada campaña: cargando, cargados o con el error de la carga.
  // Un fallo no es «sin grupos» (revisión de la PR #1145, como Meta en la #1169).
  const [grupos, setGrupos] = useState<Record<string, Grupo[] | 'cargando' | { error: string }>>({});
  // Cada vuelta de la tabla (campus o fechas) invalida los grupos pedidos antes.
  const vueltaTabla = useRef(0);
  const [recarga, setRecarga] = useState(0);

  const cargarEstado = useCallback(() => {
    googleAdsApi.estado()
      .then((e) => { setEstados(e?.campus || []); setSyncActivo(Boolean(e?.activo)); })
      .catch(() => setEstados([]));
  }, []);
  useEffect(() => { cargarEstado(); }, [cargarEstado]);

  const estado = useMemo(() => estados?.find((e) => e.project_id === projectId) || null, [estados, projectId]);
  const conectado = Boolean(estado);
  const moneda = datos?.cuenta?.moneda || estado?.moneda || 'EUR';
  const dinero = useCallback((n: number | null | undefined) => (n == null ? '—'
    : new Intl.NumberFormat('es-ES', { style: 'currency', currency: moneda, maximumFractionDigits: 2 }).format(n)), [moneda]);

  useEffect(() => {
    if (!projectId || !conectado || desde > hasta) return undefined;
    let vivo = true;
    vueltaTabla.current += 1;
    setCargando(true); setError(null); setGrupos({}); setAbierta(null);
    Promise.all([googleAdsApi.campanas(projectId, desde, hasta), googleAdsApi.diario(projectId, desde, hasta)])
      .then(([c, d]) => { if (vivo) { setDatos(c); setDias(d || []); } })
      .catch((err: { data?: { error?: string }; message?: string }) => {
        if (vivo) setError(err?.data?.error || err?.message || 'No se pudo cargar');
      })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [projectId, conectado, desde, hasta, estado?.last_synced_at, recarga]);

  async function sincronizar() {
    if (!projectId) return;
    setSincronizando(true);
    try {
      const r = await googleAdsApi.sincronizar(projectId);
      toast({ title: 'Google Ads al día', description: `${r?.campanas ?? 0} campañas, del ${r?.desde} al ${r?.hasta}.` });
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      toast({ title: 'No se pudo sincronizar', description: e?.data?.error || e?.message, variant: 'destructive' });
    } finally {
      setSincronizando(false);
      cargarEstado();
    }
  }

  function abrir(c: Campana) {
    if (!projectId) return;
    if (abierta === c.campaign_id) { setAbierta(null); return; }
    setAbierta(c.campaign_id);
    const g = grupos[c.campaign_id];
    // Ya cargados o cargando: nada. Con error, se vuelve a intentar al abrir.
    if (g && !(typeof g === 'object' && 'error' in g)) return;
    cargarGrupos(c.campaign_id);
  }

  function cargarGrupos(campaignId: string) {
    if (!projectId) return;
    const vuelta = vueltaTabla.current;
    const vale = () => vuelta === vueltaTabla.current;
    setGrupos((g) => ({ ...g, [campaignId]: 'cargando' }));
    googleAdsApi.grupos(projectId, campaignId, desde, hasta)
      .then((gs) => { if (vale()) setGrupos((g) => ({ ...g, [campaignId]: gs || [] })); })
      .catch((err: { data?: { error?: string }; message?: string }) => {
        if (vale()) setGrupos((g) => ({ ...g, [campaignId]: { error: err?.data?.error || err?.message || 'No se pudo cargar' } }));
      });
  }

  async function asignar(c: Campana, destino: number) {
    if (!projectId) return;
    try {
      await googleAdsApi.asignarCampus(projectId, c.campaign_id, destino === projectId ? null : destino);
      const a = projects.find((p) => p.id === destino)?.nombre || 'el campus elegido';
      toast({ title: 'Campaña reasignada', description: `«${c.nombre}» cuenta ahora en ${a}.` });
      setRecarga((n) => n + 1);
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      toast({ title: 'No se pudo reasignar', description: e?.data?.error || e?.message, variant: 'destructive' });
    }
  }

  function descargar() {
    if (!datos) return;
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const dec = (n: number | null) => (n == null ? '' : String(n).replace('.', ','));
    const cab = ['Campaña', 'Estado', 'Tipo', 'Gasto', 'Impresiones', 'Clics', 'CPC', 'Prospectos', 'Coste por prospecto', 'Ventas', 'Coste por venta', 'Cobrado', 'Retorno'];
    const lineas = [cab.map(esc).join(';')];
    for (const c of datos.campanas) {
      lineas.push([c.nombre, ESTADO[c.estado || '']?.texto || c.estado, TIPO[c.tipo || ''] || c.tipo, dec(c.coste), c.impresiones, c.clics,
        dec(c.cpc), c.leads, dec(c.coste_por_lead), c.ventas, dec(c.coste_por_venta), dec(c.cobrado), dec(c.retorno)].map(esc).join(';'));
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([`﻿${lineas.join('\n')}`], { type: 'text/csv;charset=utf-8;' }));
    a.download = `google-ads-${campus.nombre || projectId}-${desde}_${hasta}.csv`;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
  }

  const selector = <ElegirCampus campus={campus} que="su publicidad en Google" />;

  if (!projectId) {
    return <div className="space-y-3">{selector}<p className="text-sm text-muted-foreground">Elige un campus para ver su Google Ads.</p></div>;
  }
  if (estados === null) return <div className="space-y-3">{selector}<div className="h-40 rounded-lg bg-muted/40 animate-pulse" /></div>;

  if (!conectado) {
    return (
      <div className="space-y-3">
        {selector}
        <section className="rounded-lg border border-border bg-card p-5 max-w-2xl">
          <h2 className="text-base font-semibold flex items-center gap-2"><PlugsConnected size={18} /> {campus.nombre || 'Este campus'} no tiene Google Ads conectado</h2>
          <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground list-decimal pl-5">
            <li>Autoriza con la cuenta de Google que gestiona los anuncios y consigue el <strong>refresh token</strong> (cliente OAuth de la app).</li>
            <li>Apunta el id de la cuenta de Google Ads del campus (<code className="text-xs">123-456-7890</code>, arriba a la derecha en Google Ads) y, si entras por una cuenta de administrador, el de esa también.</li>
            <li>Guárdalo en <Link to="/configuracion/claves" className="text-primary underline">Configuración › Claves</Link> como <strong>Google Ads</strong> de este campus:
              <code className="block mt-1 text-xs break-all">{'{"refresh_token":"1//…","customer_id":"123-456-7890","login_customer_id":"…"}'}</code></li>
            <li>Pulsa «Probar»: tiene que decir el nombre de la cuenta. El developer token lo pone quien administra el servidor.</li>
          </ol>
        </section>
      </div>
    );
  }

  const t = datos?.total;

  return (
    <div className="space-y-5 pb-8">
      {selector}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            Cuenta {estado?.cuenta || estado?.customer_id || '—'} · Última sincronización: {cuando(estado?.last_synced_at || null)}
            {!syncActivo && ' · la sincronización automática está apagada'}
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
          {puedeEditar && (
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
      ) : cargando && !datos ? (
        <div className="h-64 rounded-lg bg-muted/40 animate-pulse" />
      ) : datos && t ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
            <Cifra titulo="Gasto" valor={dinero(t.coste)} detalle={`${num(t.clics)} clics · CPC ${dinero(t.cpc)}`} />
            <Cifra titulo="Prospectos" valor={num(t.leads)} detalle={`Coste por prospecto ${dinero(t.coste_por_lead)}`} />
            <Cifra titulo="Ventas" valor={num(t.ventas)} detalle="De esos prospectos, con algún cobro" />
            <Cifra titulo="Coste por venta" valor={dinero(t.coste_por_venta)} detalle="Gasto entre ventas del CRM" destacada />
            <Cifra titulo="Cobrado" valor={dinero(t.cobrado)} detalle={`Retorno ${dinero(t.retorno)}`} />
          </div>

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><ChartLineUp size={16} /> Gasto por día</h2>
            <p className="text-[11px] text-muted-foreground mb-2">Pasa el ratón por un día para ver clics e impresiones. Un hueco es un día sin dato de Google.</p>
            {dias.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6">Sin gasto en el periodo.</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dias} margin={{ top: 8, right: 8, bottom: 0, left: -4 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="fecha" tickFormatter={diaCorto} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <Tooltip content={<TooltipDia dinero={dinero} />} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeDasharray: '3 3' }} />
                    <Line type="monotone" dataKey="coste" name="Gasto" stroke="hsl(var(--primary))" strokeWidth={2}
                      dot={false} activeDot={{ r: 5, stroke: 'hsl(var(--card))', strokeWidth: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-border bg-card p-4 min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
              <div>
                <h2 className="text-sm font-semibold">Campañas</h2>
                <p className="text-[11px] text-muted-foreground max-w-2xl">
                  Ordenadas por gasto. Pulsa una para ver sus grupos de anuncios y anuncios. Los prospectos son los que
                  llegaron con la campaña en <code>utm_campaign</code> (su id o su nombre).
                </p>
              </div>
              <button type="button" onClick={descargar} disabled={!datos.campanas.length}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-semibold hover:bg-muted disabled:opacity-40">
                <FileCsv size={14} weight="bold" /> CSV
              </button>
            </div>
            {datos.campanas.length === 0 ? (
              <p className="text-sm text-muted-foreground py-3">No hay campañas con gasto ni activas en el periodo.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px] whitespace-nowrap">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold">Campaña</th>
                      <th className="px-3 py-2 text-right font-bold">Gasto</th>
                      <th className="px-3 py-2 text-right font-bold">Clics</th>
                      <th className="px-3 py-2 text-right font-bold">CPC</th>
                      <th className="px-3 py-2 text-right font-bold">Prospectos</th>
                      <th className="px-3 py-2 text-right font-bold">Ventas</th>
                      <th className="px-3 py-2 text-right font-bold">Coste por venta</th>
                      <th className="px-3 py-2 text-right font-bold">Cobrado</th>
                      {puedeEditar && <th className="px-3 py-2 text-left font-bold">Campus</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {datos.campanas.map((c) => {
                      const g = grupos[c.campaign_id];
                      const abiertaEsta = abierta === c.campaign_id;
                      return (
                        <Fragment key={c.campaign_id}>
                          <tr className="border-b border-border/50 hover:bg-muted/40">
                            <td className="px-3 py-1.5 max-w-[320px]">
                              <button type="button" onClick={() => abrir(c)} aria-expanded={abiertaEsta}
                                className="flex items-center gap-1.5 text-left min-w-0 w-full">
                                {abiertaEsta ? <CaretDown size={12} /> : <CaretRight size={12} />}
                                <span className="truncate font-medium" title={c.nombre}>{c.nombre}</span>
                              </button>
                              <span className="ml-5 inline-flex gap-1.5 text-[10px] text-muted-foreground">
                                {c.estado && <span className={`rounded px-1 ${ESTADO[c.estado]?.clase || ''}`}>{ESTADO[c.estado]?.texto || c.estado}</span>}
                                {c.tipo && <span>{TIPO[c.tipo] || c.tipo}</span>}
                                {c.presupuesto_diario != null && <span>{dinero(c.presupuesto_diario)}/día</span>}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{dinero(c.coste)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{num(c.clics)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{dinero(c.cpc)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{num(c.leads)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{num(c.ventas)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{dinero(c.coste_por_venta)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{dinero(c.cobrado)}</td>
                            {puedeEditar && (
                              <td className="px-3 py-1.5">
                                <label className="sr-only" htmlFor={`campus-${c.campaign_id}`}>Campus de {c.nombre}</label>
                                <select id={`campus-${c.campaign_id}`} value={projectId} onChange={(e) => asignar(c, Number(e.target.value))}
                                  className="h-7 max-w-[160px] rounded border border-border bg-card px-1 text-[11px]">
                                  {projects.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                                </select>
                              </td>
                            )}
                          </tr>
                          {abiertaEsta && (
                            <tr className="bg-muted/20">
                              <td colSpan={puedeEditar ? 9 : 8} className="px-6 py-2">
                                {g === 'cargando' || g === undefined ? (
                                  <p className="text-muted-foreground">Cargando grupos…</p>
                                ) : !Array.isArray(g) ? (
                                  <div role="alert" className="flex flex-wrap items-center gap-2 text-xs text-destructive">
                                    <Warning size={14} weight="bold" className="shrink-0" />
                                    <span>No se han podido cargar los grupos de esta campaña: {g.error}</span>
                                    <button type="button" onClick={() => cargarGrupos(c.campaign_id)}
                                      className="inline-flex items-center gap-1 rounded border border-border bg-card px-2 py-0.5 font-semibold text-foreground hover:bg-muted">
                                      <ArrowsClockwise size={12} /> Reintentar
                                    </button>
                                  </div>
                                ) : g.length === 0 ? (
                                  <p className="text-muted-foreground">Sin grupos con impresiones en el periodo (Máximo rendimiento no tiene grupos de anuncios).</p>
                                ) : (
                                  <ul className="space-y-1.5">
                                    {g.map((gr) => (
                                      <li key={gr.id}>
                                        <p className="flex items-baseline gap-3">
                                          <span className="truncate font-medium max-w-[320px]" title={gr.nombre}>{gr.nombre}</span>
                                          <span className="tabular-nums text-muted-foreground">{dinero(gr.coste)} · {num(gr.clics)} clics · CTR {pct(gr.ctr)}</span>
                                        </p>
                                        {gr.anuncios.length > 0 && (
                                          <ul className="ml-4 mt-0.5 space-y-0.5 text-muted-foreground">
                                            {gr.anuncios.map((a) => (
                                              <li key={a.id} className="flex items-baseline gap-3">
                                                <span className="truncate max-w-[304px]" title={a.nombre}>Anuncio {a.nombre}</span>
                                                <span className="tabular-nums">{dinero(a.coste)} · {num(a.clics)} clics</span>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info size={12} className="mt-0.5 shrink-0" />
              Ventas y cobrado son los del CRM (con algún cobro, sin mensualidades), de los prospectos que entraron en el periodo; las «conversiones» de Google no cuentan.
            </p>
          </section>
        </>
      ) : null}
    </div>
  );
}
