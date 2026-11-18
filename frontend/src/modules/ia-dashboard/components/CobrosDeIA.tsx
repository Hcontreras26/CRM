import { useEffect, useMemo, useState } from 'react';
import client from '@/shared/api/client';
import KpiCard from '@/shared/components/ui/KpiCard';
import {
  CreditCard, ArrowCounterClockwise, MagnifyingGlass, Receipt, TrendUp, X, CaretLeft, CaretRight,
} from '@phosphor-icons/react';

/*
  LOS COBROS DE UN PROYECTO IA, ORDENADOS (#44).

  Sus cobros no entran por Stripe sino por la base de la propia app, y llegan al
  CRM como ventas: una por cobro, ya sea el alta o una renovacion. Aquí se
  leen juntos, con lo que se devolvio al lado, y se filtran EN EL SERVIDOR para
  que las cifras de arriba y la tabla hablen siempre del mismo conjunto.

  Solo hay filtros de lo que un proyecto de IA tiene de verdad: tipo de cobro,
  plan, persona y fechas. Nada de cursos, gestoras ni cuotas.
*/

type Fila = {
  id: number; fecha: string; producto: string; importe: number; devuelto: number;
  renovacion: boolean; nombre: string | null; email: string | null; referencia: string | null;
};
type Totales = { n: number; bruto: number; devuelto: number; neto: number; altas: number; renovaciones: number; devueltos: number };

const TIPOS = [
  { id: '', etiqueta: 'Todos' },
  { id: 'alta', etiqueta: 'Altas' },
  { id: 'renovacion', etiqueta: 'Renovaciones' },
  { id: 'devuelto', etiqueta: 'Devueltos' },
] as const;
const PLANES = [
  { id: '', etiqueta: 'Todos los planes' },
  { id: 'mensual', etiqueta: 'Mensual' },
  { id: 'anual', etiqueta: 'Anual' },
] as const;

const eur = (n: number) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n || 0);
const dia = (iso: string) => new Date(iso + 'T00:00:00').toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Atajos de fecha, como en el resto del CRM: lo que se mira casi siempre. */
function rangoRapido(id: string): { desde: string; hasta: string } {
  const hoy = new Date();
  if (id === 'mes') return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: iso(hoy) };
  if (id === 'pasado') return { desde: iso(new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1)), hasta: iso(new Date(hoy.getFullYear(), hoy.getMonth(), 0)) };
  if (id === 'anio') return { desde: `${hoy.getFullYear()}-01-01`, hasta: iso(hoy) };
  return { desde: '', hasta: '' };
}
const RAPIDOS = [
  { id: 'mes', etiqueta: 'Este mes' },
  { id: 'pasado', etiqueta: 'Mes pasado' },
  { id: 'anio', etiqueta: 'Este año' },
  { id: 'todo', etiqueta: 'Todo' },
];

/** Un grupo de opciones en forma de pastillas: la elegida se ve de un vistazo. */
function Pastillas<T extends string>({ valor, opciones, onChange, cuenta }: {
  valor: T; opciones: readonly { id: T; etiqueta: string }[]; onChange: (v: T) => void;
  cuenta?: (id: T) => number | undefined;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1.5" role="group">
      {opciones.map((o) => {
        const activa = valor === o.id;
        const n = cuenta?.(o.id);
        return (
          <button
            key={o.id || 'todos'}
            type="button"
            aria-pressed={activa}
            onClick={() => onChange(o.id)}
            className={`h-8 px-3 rounded-full text-[13px] font-medium border transition-colors ${
              activa
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground'}`}
          >
            {o.etiqueta}
            {n !== undefined && (
              <span className={`ml-1.5 tabular-nums text-[11px] ${activa ? 'opacity-90' : 'opacity-70'}`}>{n}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Etiqueta({ fila }: { fila: Fila }) {
  if (fila.devuelto > 0) {
    return <span className="inline-flex items-center rounded-full bg-destructive-soft px-2 py-0.5 text-[11px] font-semibold text-destructive-soft-foreground">Devuelto</span>;
  }
  return fila.renovacion
    ? <span className="inline-flex items-center rounded-full bg-info-soft px-2 py-0.5 text-[11px] font-semibold text-info-soft-foreground">Renovación</span>
    : <span className="inline-flex items-center rounded-full bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success-soft-foreground">Alta</span>;
}

export default function CobrosDeIA({ projectId, nombre }: { projectId: number; nombre?: string }) {
  const [tipo, setTipo] = useState<string>('');
  const [plan, setPlan] = useState<string>('');
  const [busqueda, setBusqueda] = useState('');
  const [q, setQ] = useState('');
  const [rapido, setRapido] = useState('todo');
  const [fechas, setFechas] = useState({ desde: '', hasta: '' });
  const [page, setPage] = useState(1);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [totales, setTotales] = useState<Totales | null>(null);
  const [paginas, setPaginas] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // La búsqueda espera a que se deje de escribir: una petición por letra no ayuda a nadie.
  useEffect(() => {
    const t = setTimeout(() => { setQ(busqueda.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [busqueda]);

  // Contar cuántos hay de cada tipo, con el MISMO resto de filtros, para que los números de las
  // pastillas respondan a lo que se está mirando y no a todo el proyecto.
  const [cuentas, setCuentas] = useState<Record<string, number>>({});

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError(null);
    const base = { plan: plan || undefined, q: q || undefined, desde: fechas.desde || undefined, hasta: fechas.hasta || undefined };
    client.get(`/ia/cobros/${projectId}`, { params: { ...base, tipo: tipo || undefined, page, limit: 25 } })
      .then((res: any) => {
        if (!vivo) return;
        setFilas(res.data?.rows || res.rows || []);
        setTotales(res.data?.totales || res.totales || null);
        setPaginas((res.data?.pagination || res.pagination)?.totalPages || 1);
        // las cuentas de las pastillas salen de los totales cuando no hay filtro de tipo
        if (!tipo) {
          const t = res.data?.totales || res.totales;
          if (t) setCuentas({ '': t.n, alta: t.altas, renovacion: t.renovaciones, devuelto: t.devueltos });
        }
      })
      .catch((e: any) => { if (vivo) setError(e?.response?.data?.error || 'No se pudieron cargar los cobros'); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [projectId, tipo, plan, q, fechas.desde, fechas.hasta, page]);

  const hayFiltros = Boolean(tipo || plan || q || fechas.desde || fechas.hasta);
  const limpiar = () => { setTipo(''); setPlan(''); setBusqueda(''); setQ(''); setRapido('todo'); setFechas({ desde: '', hasta: '' }); setPage(1); };
  const elegirRapido = (id: string) => { setRapido(id); setFechas(rangoRapido(id)); setPage(1); };
  const sinDatos = useMemo(() => !cargando && !error && filas.length === 0, [cargando, error, filas.length]);

  return (
    <div className="space-y-4">
      {/* Cifras: del mismo filtro que la tabla de abajo */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard icon={Receipt} iconBg="bg-info-soft text-info-soft-foreground" label="Cobros"
          numericValue={totales?.n ?? 0} />
        <KpiCard icon={TrendUp} iconBg="bg-success-soft text-success-soft-foreground" label="Cobrado (bruto)"
          numericValue={totales?.bruto ?? 0} format={(n) => eur(Number(n))} />
        <KpiCard icon={ArrowCounterClockwise} iconBg="bg-destructive-soft text-destructive-soft-foreground" label="Devuelto"
          numericValue={totales?.devuelto ?? 0} format={(n) => eur(Number(n))} />
        <KpiCard icon={CreditCard} iconBg="bg-primary/10 text-primary" label="Neto"
          numericValue={totales?.neto ?? 0} format={(n) => eur(Number(n))} />
      </div>

      {/* Filtros: solo lo que un proyecto de IA tiene de verdad */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tipo de cobro</div>
            <Pastillas valor={tipo} opciones={TIPOS as any} onChange={(v) => { setTipo(v); setPage(1); }} cuenta={(id) => cuentas[id]} />
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Plan</div>
            <Pastillas valor={plan} opciones={PLANES as any} onChange={(v) => { setPlan(v); setPage(1); }} />
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="relative flex-1 min-w-[220px]">
            <span className="sr-only">Buscar por correo o nombre</span>
            <MagnifyingGlass size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por correo o nombre…"
              className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {busqueda && (
              <button type="button" aria-label="Borrar búsqueda" onClick={() => setBusqueda('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X size={14} />
              </button>
            )}
          </label>

          <div className="flex flex-wrap items-center gap-1.5">
            <Pastillas valor={rapido} opciones={RAPIDOS as any} onChange={elegirRapido} />
            <input type="date" value={fechas.desde} aria-label="Desde"
              onChange={(e) => { setFechas((f) => ({ ...f, desde: e.target.value })); setRapido(''); setPage(1); }}
              className="h-8 rounded-md border border-border bg-card px-2 text-[13px]" />
            <span className="text-xs text-muted-foreground">a</span>
            <input type="date" value={fechas.hasta} aria-label="Hasta"
              onChange={(e) => { setFechas((f) => ({ ...f, hasta: e.target.value })); setRapido(''); setPage(1); }}
              className="h-8 rounded-md border border-border bg-card px-2 text-[13px]" />
          </div>

          {hayFiltros && (
            <button type="button" onClick={limpiar}
              className="h-8 inline-flex items-center gap-1 rounded-md px-2 text-[13px] font-medium text-primary hover:bg-primary/10">
              <X size={13} /> Quitar filtros
            </button>
          )}
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        {error ? (
          <div className="p-8 text-center text-sm text-destructive">{error}</div>
        ) : cargando && filas.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Cargando cobros…</div>
        ) : sinDatos ? (
          <div className="p-12 text-center space-y-1">
            <CreditCard size={30} weight="duotone" className="mx-auto text-muted-foreground" />
            <p className="text-sm font-semibold">{hayFiltros ? 'Ningún cobro con estos filtros' : `${nombre || 'Este proyecto'} todavía no tiene cobros`}</p>
            {hayFiltros && <button type="button" onClick={limpiar} className="text-xs text-primary hover:underline">Quitar los filtros</button>}
          </div>
        ) : (
          <table className="tabla-cifras w-full text-[13px]">
            <thead className="bg-muted/50 border-b">
              <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">Fecha</th>
                <th className="px-4 py-2.5 font-semibold">Cliente</th>
                <th className="px-4 py-2.5 font-semibold">Tipo</th>
                <th className="px-4 py-2.5 font-semibold">Plan</th>
                <th className="px-4 py-2.5 font-semibold text-right">Importe</th>
                <th className="px-4 py-2.5 font-semibold text-right">Devuelto</th>
                <th className="px-4 py-2.5 font-semibold">Referencia</th>
              </tr>
            </thead>
            <tbody className={cargando ? 'opacity-60 transition-opacity' : ''}>
              {filas.map((f) => (
                <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">{dia(f.fecha)}</td>
                  <td className="px-4 py-2.5">
                    <div className="font-medium leading-tight">{f.nombre || f.email}</div>
                    {f.nombre && f.email && f.nombre !== f.email && <div className="text-xs text-muted-foreground">{f.email}</div>}
                  </td>
                  <td className="px-4 py-2.5"><Etiqueta fila={f} /></td>
                  <td className="px-4 py-2.5 text-muted-foreground">{/anual/i.test(f.producto) ? 'Anual' : /mensual/i.test(f.producto) ? 'Mensual' : f.producto}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{eur(f.importe)}</td>
                  <td className={`px-4 py-2.5 text-right tabular-nums ${f.devuelto > 0 ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>{f.devuelto > 0 ? `−${eur(f.devuelto)}` : '—'}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground max-w-[180px] truncate" title={f.referencia || undefined}>{f.referencia || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {paginas > 1 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Página {page} de {paginas}</span>
          <div className="flex gap-1.5">
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40" aria-label="Página anterior"><CaretLeft size={14} /></button>
            <button type="button" disabled={page >= paginas} onClick={() => setPage((p) => p + 1)}
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-muted disabled:opacity-40" aria-label="Página siguiente"><CaretRight size={14} /></button>
          </div>
        </div>
      )}
    </div>
  );
}
