import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowsClockwise, ChartLineUp, Info, MagnifyingGlass, PlugsConnected, Warning, Lightbulb, FileX,
} from '@phosphor-icons/react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useCampusDeLaPantalla } from '@/shared/hooks/useCampusDeLaPantalla';
import ElegirCampus from '@/shared/components/ui/ElegirCampus';
import usePermission from '@/shared/hooks/usePermission';
import { toast } from '@/shared/hooks/useToast';
import {
  searchConsoleApi, LIMITE_CONSULTAS, LIMITE_PAGINAS, type EstadoCampus, type DiaGsc, type Totales,
} from '../api/searchConsole.api';
import { useOrganicTraffic, PRESET_PERIODS, type Preset } from '../hooks/useOrganicTraffic';
import { LineaSemana, useSemanaGsc } from '../components/LineaSemana';
import { BotonCsv, consultasEnCsv, paginasEnCsv, nombreFichero } from '../components/ExportarCsvGsc';

/**
 * Tráfico orgánico (CRM#36): lo que pasa en Google antes de la visita, de UN
 * campus (cada uno tiene su propiedad de Search Console).
 *
 * Lo que pidió Carlos (tarea 222): clics, impresiones, CTR y posición
 * comparando con el periodo anterior; las páginas con muchas impresiones y CTR
 * bajo, para que Julián mejore títulos y descripciones; y el aviso de las
 * páginas de formación que Google no tiene indexadas.
 */

const num = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('es-ES').format(n));
const pct = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('es-ES', { maximumFractionDigits: 2 })} %`);
const pos = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
const diaCorto = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const cuando = (s: string | null) => (s ? new Date(s).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : 'nunca');

/**
 * La variación respecto al periodo anterior. En la posición, bajar es mejorar
 * (la 3 es mejor que la 8), así que se mira al revés.
 */
function Variacion({ ahora, antes, menosEsMejor = false, enPuntos = false }: {
  ahora: number | null; antes: number | null; menosEsMejor?: boolean; enPuntos?: boolean;
}) {
  if (ahora == null || antes == null) return <span className="text-muted-foreground">sin periodo anterior</span>;
  const dif = enPuntos ? ahora - antes : (antes === 0 ? null : ((ahora - antes) / antes) * 100);
  if (dif == null) return <span className="text-muted-foreground">antes: 0</span>;
  if (Math.abs(dif) < 0.05) return <span className="text-muted-foreground">igual que antes</span>;
  const mejora = menosEsMejor ? dif < 0 : dif > 0;
  const texto = enPuntos
    ? `${dif > 0 ? '+' : '−'}${Math.abs(dif).toLocaleString('es-ES', { maximumFractionDigits: 1 })}`
    : `${dif > 0 ? '+' : '−'}${Math.abs(dif).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %`;
  return <span className={mejora ? 'text-success' : 'text-destructive'}>{texto} vs. periodo anterior</span>;
}

function Cifra({ titulo, valor, detalle }: { titulo: string; valor: string; detalle?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 min-w-0">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-2xl font-semibold tabular-nums tracking-tight">{valor}</p>
      {detalle && <p className="text-[11px] mt-0.5">{detalle}</p>}
    </div>
  );
}

function TooltipDia({ active, payload }: { active?: boolean; payload?: Array<{ payload: DiaGsc }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold mb-1">{diaCorto(d.fecha)}</p>
      {d.clics == null ? <p>Sin datos de Search Console</p> : (
        <>
          <p>Clics: <span className="tabular-nums font-semibold">{num(d.clics)}</span></p>
          <p>Impresiones: <span className="tabular-nums font-semibold">{num(d.impresiones)}</span></p>
          <p>CTR: <span className="tabular-nums font-semibold">{pct(d.ctr)}</span></p>
          <p>Posición: <span className="tabular-nums font-semibold">{pos(d.posicion)}</span></p>
        </>
      )}
    </div>
  );
}

function Posicion({ value }: { value: number | null }) {
  const v = Number(value || 0);
  let color = 'bg-muted text-muted-foreground';
  if (v > 0 && v <= 3) color = 'bg-success-soft text-success-soft-foreground';
  else if (v > 0 && v <= 10) color = 'bg-info-soft text-info-soft-foreground';
  else if (v > 0 && v <= 20) color = 'bg-warning-soft text-warning-soft-foreground';
  else if (v > 20) color = 'bg-destructive-soft text-destructive-soft-foreground';
  return <span className={`inline-flex px-1.5 py-px rounded text-[10px] font-semibold tabular-nums ${color}`}>{pos(value)}</span>;
}

/** Los estados de cobertura de Google más habituales, en español. */
const COBERTURA: Record<string, string> = {
  'Submitted and indexed': 'Enviada e indexada',
  'Indexed, not submitted in sitemap': 'Indexada, sin estar en el sitemap',
  'Crawled - currently not indexed': 'Rastreada, sin indexar',
  'Discovered - currently not indexed': 'Descubierta, sin indexar',
  'URL is unknown to Google': 'Google no la conoce',
  'Excluded by ‘noindex’ tag': 'Excluida por «noindex»',
  'Page with redirect': 'Página con redirección',
  'Not found (404)': 'No encontrada (404)',
  'Duplicate without user-selected canonical': 'Duplicada, sin canónica elegida',
  'Duplicate, Google chose different canonical than user': 'Duplicada: Google eligió otra canónica',
  'Alternate page with proper canonical tag': 'Alternativa con su canónica',
  'Blocked by robots.txt': 'Bloqueada por robots.txt',
  'Soft 404': '404 suave',
};
const cobertura = (c: string | null) => (c ? COBERTURA[c] || c : '');
const VEREDICTO: Record<string, { texto: string; tono: string }> = {
  PASS: { texto: 'Indexada', tono: 'bg-success-soft text-success-soft-foreground' },
  PARTIAL: { texto: 'Con avisos', tono: 'bg-warning-soft text-warning-soft-foreground' },
  NEUTRAL: { texto: 'No indexada', tono: 'bg-warning-soft text-warning-soft-foreground' },
  FAIL: { texto: 'Con error', tono: 'bg-destructive-soft text-destructive-soft-foreground' },
  ERROR: { texto: 'No se pudo mirar', tono: 'bg-muted text-muted-foreground' },
};
const veredicto = (v: string) => VEREDICTO[v] || { texto: v, tono: 'bg-muted text-muted-foreground' };

export default function SeoPage() {
  const campus = useCampusDeLaPantalla();
  const projectId = campus.id;
  const { can } = usePermission();
  const puedeSincronizar = can('search_console.edit');
  const puedeVer = can('search_console.view');

  const [estados, setEstados] = useState<EstadoCampus[] | null>(null);
  const [syncActivo, setSyncActivo] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [buscarConsulta, setBuscarConsulta] = useState('');
  const [buscarPagina, setBuscarPagina] = useState('');
  const [soloOportunidades, setSoloOportunidades] = useState(false);

  const cargarEstado = useCallback(() => {
    searchConsoleApi.estado()
      .then((e) => { setEstados(e?.campus || []); setSyncActivo(Boolean(e?.activo)); })
      .catch(() => setEstados([]));
  }, []);
  useEffect(() => { cargarEstado(); }, [cargarEstado]);

  const estado = useMemo(() => estados?.find((e) => e.project_id === projectId) || null, [estados, projectId]);
  const conectado = Boolean(estado);
  const seo = useOrganicTraffic(projectId, conectado, estado?.last_synced_at);
  const semana = useSemanaGsc(projectId, conectado, estado?.last_synced_at);

  const consultas = useMemo(() => {
    const f = buscarConsulta.trim().toLowerCase();
    return f ? seo.consultas.filter((c) => c.consulta.toLowerCase().includes(f)) : seo.consultas;
  }, [seo.consultas, buscarConsulta]);
  const paginas = useMemo(() => {
    const f = buscarPagina.trim().toLowerCase();
    return (seo.paginas?.filas || []).filter((p) =>
      (!soloOportunidades || p.oportunidad) && (!f || `${p.host}${p.ruta}`.includes(f)));
  }, [seo.paginas, buscarPagina, soloOportunidades]);
  const oportunidades = useMemo(() => (seo.paginas?.filas || []).filter((p) => p.oportunidad).length, [seo.paginas]);
  const sinIndexar = useMemo(() => (seo.indexacion?.paginas || []).filter((p) => p.veredicto !== 'PASS'), [seo.indexacion]);

  async function sincronizar() {
    if (!projectId) return;
    setSincronizando(true);
    try {
      const r = await searchConsoleApi.sincronizar(projectId);
      toast({ title: 'Search Console al día', description: `Traídos los últimos ${r?.dias ?? ''} días.` });
    } catch (err) {
      const e = err as { data?: { error?: string }; message?: string };
      toast({ title: 'No se pudo sincronizar', description: e?.data?.error || e?.message, variant: 'destructive' });
    } finally {
      setSincronizando(false);
      cargarEstado();
    }
  }

  const selector = <ElegirCampus campus={campus} que="su tráfico orgánico" />;

  if (!projectId) {
    return <div className="space-y-3">{selector}<p className="text-sm text-muted-foreground">Elige un campus para ver su tráfico orgánico.</p></div>;
  }
  if (estados === null) return <div className="space-y-3">{selector}<div className="h-40 rounded-lg bg-muted/40 animate-pulse" /></div>;

  if (!conectado) {
    return (
      <div className="space-y-3">
        {selector}
        <section className="rounded-lg border border-border bg-card p-5 max-w-2xl">
          <h2 className="text-base font-semibold flex items-center gap-2"><PlugsConnected size={18} /> {campus.nombre || 'Este campus'} no tiene Search Console conectado</h2>
          <ol className="mt-3 space-y-1.5 text-sm text-muted-foreground list-decimal pl-5">
            <li>En Google Cloud, activa la «Google Search Console API» y crea una cuenta de servicio con su clave en JSON (puede ser la misma de Google Analytics).</li>
            <li>En Search Console, en <em>Configuración › Usuarios y permisos</em> de la propiedad, añade el correo de la cuenta de servicio (permiso «Restringido» basta).</li>
            <li>Añade al JSON <code className="text-xs">"site_url": "sc-domain:tuweb.com"</code> (propiedad de dominio) o <code className="text-xs">"https://tuweb.com/"</code> (prefijo de URL), tal cual aparece en Search Console.</li>
            <li>Guárdalo en <Link to="/configuracion/claves" className="text-primary underline">Configuración › Claves</Link> como <strong>Search Console</strong> de este campus y pulsa «Probar».</li>
          </ol>
        </section>
      </div>
    );
  }

  const r = seo.resumen;
  const t: (Totales & { dias: number }) | undefined = r?.total;
  const a = r?.anterior;
  const conAnterior = Boolean(a && a.dias > 0);

  return (
    <div className="space-y-5 pb-8">
      {selector}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {estado?.site_url || '—'} · Última sincronización: {cuando(estado?.last_synced_at || null)}
            {r?.ultimo_dia && ` · Datos hasta el ${diaCorto(r.ultimo_dia)}`}
            {!syncActivo && ' · la sincronización automática está apagada'}
          </p>
          <div className="mt-1"><LineaSemana semana={semana} /></div>
          {estado?.last_status === 'error' && (
            <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive" role="alert">
              <Warning size={14} weight="bold" className="mt-0.5 shrink-0" /> La última vez falló: {estado.last_error}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex gap-1" role="group" aria-label="Periodo">
            {Object.entries(PRESET_PERIODS).map(([k, v]) => (
              <button key={k} type="button"
                onClick={() => { seo.setCustomRange(null); seo.setPreset(k as Preset); }}
                aria-pressed={seo.preset === k && !seo.customRange}
                className={`h-8 px-2.5 rounded-md text-xs font-medium whitespace-nowrap ${
                  seo.preset === k && !seo.customRange ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
                {v.label}
              </button>
            ))}
          </div>
          <label className="text-xs text-muted-foreground">Desde
            <input type="date" value={seo.range.fechaDesde} max={seo.range.fechaHasta}
              onChange={(e) => seo.setCustomRange({ ...seo.range, fechaDesde: e.target.value })}
              className="block h-8 rounded-md border border-border bg-card px-2 text-sm text-foreground" />
          </label>
          <label className="text-xs text-muted-foreground">Hasta
            <input type="date" value={seo.range.fechaHasta} min={seo.range.fechaDesde}
              onChange={(e) => seo.setCustomRange({ ...seo.range, fechaHasta: e.target.value })}
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

      {seo.error ? (
        <p className="text-sm text-destructive">{seo.error}</p>
      ) : seo.loading && !r ? (
        <div className="h-64 rounded-lg bg-muted/40 animate-pulse" />
      ) : r && t ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            <Cifra titulo="Clics" valor={num(t.clics)} detalle={<Variacion ahora={t.clics} antes={conAnterior ? a!.clics : null} />} />
            <Cifra titulo="Impresiones" valor={num(t.impresiones)} detalle={<Variacion ahora={t.impresiones} antes={conAnterior ? a!.impresiones : null} />} />
            <Cifra titulo="CTR medio" valor={pct(t.ctr)} detalle={<Variacion ahora={t.ctr} antes={conAnterior ? a!.ctr : null} enPuntos />} />
            <Cifra titulo="Posición media" valor={pos(t.posicion)} detalle={<Variacion ahora={t.posicion} antes={conAnterior ? a!.posicion : null} menosEsMejor enPuntos />} />
          </div>
          {conAnterior && (
            <p className="-mt-3 text-[11px] text-muted-foreground">
              Periodo anterior: {diaCorto(a!.desde)} – {diaCorto(a!.hasta)}. En la posición, bajar es mejorar.
            </p>
          )}

          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><ChartLineUp size={16} /> Clics por día</h2>
            <p className="text-[11px] text-muted-foreground mb-2">Pasa el ratón por un día para ver sus impresiones, CTR y posición. Un hueco es un día que Search Console aún no tiene, no un cero.</p>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={r.dias} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="fecha" tickFormatter={diaCorto} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip content={<TooltipDia />} cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeDasharray: '3 3' }} />
                  <Line type="monotone" dataKey="clics" name="Clics" stroke="hsl(var(--primary))" strokeWidth={2}
                    dot={false} activeDot={{ r: 5, stroke: 'hsl(var(--card))', strokeWidth: 2 }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>

          {/* Indexación de las páginas de formación */}
          <section className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold flex items-center gap-2 mb-1"><FileX size={16} /> Páginas de formación sin indexar</h2>
            <p className="text-[11px] text-muted-foreground mb-2">
              Google revisa una vez al día la página de cada formación (la URL de su ficha de producto).
              {seo.indexacion && ` ${num(seo.indexacion.indexadas)} indexadas · ${num(seo.indexacion.no_indexadas)} sin indexar${seo.indexacion.errores ? ` · ${num(seo.indexacion.errores)} sin poder mirar` : ''}.`}
            </p>
            {!seo.indexacion || seo.indexacion.paginas.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aún no se ha revisado ninguna. Hace falta que las formaciones tengan su URL en la ficha y que sean de {estado?.site_url || 'la propiedad'}.</p>
            ) : sinIndexar.length === 0 ? (
              <p className="text-sm text-success">Todas las páginas de formación revisadas están indexadas.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[11px]">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-bold">Formación</th>
                      <th className="px-3 py-2 text-left font-bold">Página</th>
                      <th className="px-3 py-2 text-left font-bold">Estado</th>
                      <th className="px-3 py-2 text-left font-bold">Por qué</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sinIndexar.map((p) => {
                      const v = veredicto(p.veredicto);
                      return (
                        <tr key={p.url} className="border-b border-border/50">
                          <td className="px-3 py-1.5">{p.producto || '—'}</td>
                          <td className="px-3 py-1.5 font-mono break-all"><a href={p.url} target="_blank" rel="noreferrer" className="hover:underline">{p.url}</a></td>
                          <td className="px-3 py-1.5 whitespace-nowrap"><span className={`rounded px-1.5 py-px text-[10px] font-semibold ${v.tono}`}>{v.texto}</span></td>
                          <td className="px-3 py-1.5 text-muted-foreground">{p.error || cobertura(p.cobertura)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="grid gap-5 xl:grid-cols-2">
            {/* Búsquedas */}
            <section className="rounded-lg border border-border bg-card p-4 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <h2 className="text-sm font-semibold">Búsquedas</h2>
                  <p className="text-[11px] text-muted-foreground">Lo que escribe la gente en Google antes de entrar. Google oculta las poco frecuentes.</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="relative">
                    <span className="sr-only">Buscar búsqueda</span>
                    <MagnifyingGlass size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input value={buscarConsulta} onChange={(e) => setBuscarConsulta(e.target.value)} placeholder="máster…"
                      className="h-8 w-40 rounded-md border border-border bg-card pl-7 pr-2 text-xs" />
                  </label>
                  {puedeVer && <BotonCsv etiqueta="búsquedas" filas={consultas.length} tope={LIMITE_CONSULTAS}
                    recortada={seo.consultas.length >= LIMITE_CONSULTAS}
                    generar={() => consultasEnCsv(consultas)}
                    nombre={nombreFichero('busquedas', campus.nombre || String(projectId), seo.range.fechaDesde, seo.range.fechaHasta)} />}
                </div>
              </div>
              {consultas.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">No hay búsquedas en el periodo.</p>
              ) : (
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold">Búsqueda</th>
                        <th className="px-3 py-2 text-right font-bold">Clics</th>
                        <th className="px-3 py-2 text-right font-bold" title="Clics en el periodo anterior">Antes</th>
                        <th className="px-3 py-2 text-right font-bold">Impr.</th>
                        <th className="px-3 py-2 text-right font-bold">CTR</th>
                        <th className="px-3 py-2 text-right font-bold">Pos.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {consultas.map((c) => (
                        <tr key={c.consulta} className="border-b border-border/50 hover:bg-muted/40">
                          <td className="px-3 py-1.5 max-w-[260px] truncate" title={c.consulta}>{c.consulta}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{num(c.clics)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">{num(c.clics_antes)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{num(c.impresiones)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{pct(c.ctr)}</td>
                          <td className="px-3 py-1.5 text-right"><Posicion value={c.posicion} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* Páginas */}
            <section className="rounded-lg border border-border bg-card p-4 min-w-0">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div>
                  <h2 className="text-sm font-semibold">Páginas</h2>
                  <p className="text-[11px] text-muted-foreground max-w-md">
                    <Lightbulb size={12} className="inline -mt-0.5 text-warning" /> <strong>Oportunidad</strong>: Google ya la enseña
                    (100 impresiones o más, en las dos primeras páginas) pero se pincha menos de la mitad que la media del campus
                    ({pct(seo.paginas?.ctr_medio)}): toca mejorar el título y la descripción.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={soloOportunidades} onChange={(e) => setSoloOportunidades(e.target.checked)} />
                    Solo oportunidades ({num(oportunidades)})
                  </label>
                  <label className="relative">
                    <span className="sr-only">Buscar página</span>
                    <MagnifyingGlass size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                    <input value={buscarPagina} onChange={(e) => setBuscarPagina(e.target.value)} placeholder="/curso/…"
                      className="h-8 w-36 rounded-md border border-border bg-card pl-7 pr-2 text-xs" />
                  </label>
                  {puedeVer && <BotonCsv etiqueta="páginas" filas={paginas.length} tope={LIMITE_PAGINAS}
                    recortada={(seo.paginas?.filas.length || 0) >= LIMITE_PAGINAS}
                    generar={() => paginasEnCsv(paginas)}
                    nombre={nombreFichero('paginas', campus.nombre || String(projectId), seo.range.fechaDesde, seo.range.fechaHasta)} />}
                </div>
              </div>
              {paginas.length === 0 ? (
                <p className="text-sm text-muted-foreground py-3">{soloOportunidades ? 'Ninguna página es oportunidad en este periodo.' : 'No hay páginas en el periodo.'}</p>
              ) : (
                <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                  <table className="w-full text-[11px]">
                    <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left font-bold">Página</th>
                        <th className="px-3 py-2 text-right font-bold">Clics</th>
                        <th className="px-3 py-2 text-right font-bold">Impr.</th>
                        <th className="px-3 py-2 text-right font-bold">CTR</th>
                        <th className="px-3 py-2 text-right font-bold">Pos.</th>
                        <th className="px-3 py-2 text-left font-bold" />
                      </tr>
                    </thead>
                    <tbody>
                      {paginas.map((p) => {
                        const v = p.indexacion && p.indexacion.veredicto !== 'PASS' ? veredicto(p.indexacion.veredicto) : null;
                        return (
                          <tr key={`${p.host}${p.ruta}`} className="border-b border-border/50 hover:bg-muted/40">
                            <td className="px-3 py-1.5 font-mono max-w-[240px] truncate" title={`${p.host}${p.ruta}`}>
                              <span className="text-muted-foreground">{p.host}</span>{p.ruta}
                            </td>
                            <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{num(p.clics)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{num(p.impresiones)}</td>
                            <td className="px-3 py-1.5 text-right tabular-nums">{pct(p.ctr)}</td>
                            <td className="px-3 py-1.5 text-right"><Posicion value={p.posicion} /></td>
                            <td className="px-3 py-1.5 whitespace-nowrap space-x-1">
                              {p.oportunidad && <span className="rounded px-1.5 py-px text-[10px] font-semibold bg-warning-soft text-warning-soft-foreground">Oportunidad</span>}
                              {v && <span className={`rounded px-1.5 py-px text-[10px] font-semibold ${v.tono}`} title={cobertura(p.indexacion?.cobertura || null)}>{v.texto}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>

          <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info size={12} className="mt-0.5 shrink-0" />
            Los clics de Search Console no son las visitas de Google Analytics: GA4 no cuenta a quien rechaza las cookies y un clic no
            siempre abre sesión. Search Console va 2–3 días por detrás, por eso el periodo acaba hace 3 días.
          </p>
        </>
      ) : null}
    </div>
  );
}
