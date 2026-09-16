
import { inputClass } from '@/shared/lib/ui';import { lazy, Suspense, useEffect, useState } from 'react';
import { commissionsApi, type CommissionStats } from '../api/commissions.api';
import { useAuth } from '@/contexts/AuthContext';
import PageHeader from '@/shared/components/ui/PageHeader';
import KpiCard from '@/shared/components/ui/KpiCard';
import EmptyState from '@/shared/components/ui/EmptyState';
import SkeletonTable from '@/shared/components/ui/SkeletonTable';
import Select from '@/shared/components/ui/Select';
import { toast } from '@/shared/hooks/useToast';
import {
  CurrencyEur, CheckCircle, Clock, ChartBar, Gear,
  DownloadSimple, CalendarBlank, Lock,
} from '@phosphor-icons/react';
import client from '@/shared/api/client';
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog';
import { monthLabel, isInMonth, getCommissionExportColumns, type CommissionRow } from '../lib/period';
import type { User } from '@/shared/types';
import { formatCurrencyShort as fmt, formatDate } from '@/shared/lib/format';
import { useProjectContext } from '@/contexts/ProjectContext';
import { ambitoComoObjeto } from '@/shared/lib/ambitoInforme';

const RulesDialog = lazy(() => import('../components/RulesDialog'));
const ExportDialog = lazy(() => import('@/shared/components/export/ExportDialog'));

const ESTADOS = [
  { v: '', label: 'Todas' },
  { v: 'pendiente', label: 'Pendientes' },
  { v: 'pagado', label: 'Pagadas' },
];


type PeriodMode = 'all' | 'month';

export default function CommissionsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const [items, setItems] = useState<CommissionRow[]>([]);
  const [stats, setStats] = useState<CommissionStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState('');
  const [filterUser, setFilterUser] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [pendingPay, setPendingPay] = useState<number | null>(null);
  const [bulkPay, setBulkPay] = useState(false);
  const [closingMonth, setClosingMonth] = useState(false);

  // Filtro periodo (CRM-138). 'all' = sin filtro, 'month' = mes/año.
  const today = new Date();
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);

  // Selección múltiple para "marcar pagadas en lote" (CRM-138).
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [exportOpen, setExportOpen] = useState(false);
  const { activeProject, activeIssuerId } = useProjectContext() as {
    activeProject: { id?: number | null } | null; activeIssuerId: number | null;
  };

  async function load(): Promise<void> {
    setLoading(true);
    try {
      // Sin esto la pantalla enseñaba las comisiones de TODOS los proyectos con
      // la empresa puesta arriba: cifras de una cosa con el nombre de otra.
      const ambito = ambitoComoObjeto({ activeIssuerId, activeProject });
      const params: Record<string, string | number> = {
        ...ambito, ...(filterEstado ? { estado: filterEstado } : {}),
      };
      if (filterUser) params.userId = filterUser;
      const fn = isAdmin ? commissionsApi.list : commissionsApi.listMine;
      const fnStats = isAdmin ? commissionsApi.stats : commissionsApi.statsMine;
      const [listRes, statsRes] = await Promise.all([fn(params), fnStats({ ...ambito, ...(filterUser && isAdmin ? { userId: filterUser } : {}) })]);
      if (listRes.success) setItems(listRes.data || []);
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.data?.error || err.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }

  useEffect(() => { load();   }, [filterEstado, filterUser, activeProject?.id, activeIssuerId]);
  useEffect(() => { setSelected(new Set()); }, [periodMode, year, month, filterEstado, filterUser]);

  // Aplicar filtro de mes en cliente (el backend aún no acepta el parámetro segun ticket).
  const filteredItems = periodMode === 'month'
    ? items.filter((r) => isInMonth(r.created_at, year, month))
    : items;

  const periodLabel = periodMode === 'month' ? monthLabel(year, month) : 'todo el histórico';
  const pendingInPeriod = filteredItems.filter((r) => r.estado === 'pendiente' && Number(r.importe_comision) > 0);
  const allPendingSelected = pendingInPeriod.length > 0 && pendingInPeriod.every((r) => selected.has(r.id));

  function toggleSelect(id: number): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll(): void {
    if (allPendingSelected) setSelected(new Set());
    else setSelected(new Set(pendingInPeriod.map((r) => r.id)));
  }

  async function handleBulkPay(): Promise<void> {
    if (selected.size === 0) return;
    setBulkPay(false);
    const fechaPago = new Date().toISOString().slice(0, 10);
    let ok = 0, fail = 0;
    for (const id of selected) {
      try {
        await commissionsApi.pay(id, { fecha_pago: fechaPago });
        ok++;
      } catch { fail++; }
    }
    toast({
      title: `${ok} comisión${ok !== 1 ? 'es' : ''} pagada${ok !== 1 ? 's' : ''}`,
      description: fail > 0 ? `${fail} fallaron — revisa errores` : undefined,
      variant: fail > 0 ? 'destructive' : 'default',
    });
    setSelected(new Set());
    load();
  }

  async function handleCloseMonth(): Promise<void> {
    setClosingMonth(false);
    try {
      // Endpoint backend pendiente (CRM-138). Si no existe, mostrar info.
      await client.post('/commissions/close-month', { year, month });
      toast({ title: 'Mes cerrado', description: `${monthLabel(year, month)} marcado como inmutable.` });
      load();
    } catch (err: any) {
      if (err?.status === 404 || err?.status === 405) {
        toast({
          title: 'Cierre no disponible',
          description: 'El endpoint de cierre mensual aún no está implementado en el backend (CRM-138).',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Error', description: err?.data?.error || err.message, variant: 'destructive' });
      }
    }
  }

  function handleExport(): void {
    if (filteredItems.length === 0) {
      toast({ title: 'Sin datos para exportar' });
      return;
    }
    setExportOpen(true);
  }

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      try {
        const r = await client.get('/users?role=gestor&active=true');
        if (r.success) setUsers(((r.data?.users || r.data || []) as User[]).filter((u) => u.role !== 'superadmin'));
      } catch {}
    })();
  }, [isAdmin]);

  function handlePay(id: number): void { setPendingPay(id); }
  async function doPay(): Promise<void> {
    if (pendingPay === null) return;
    try {
      await commissionsApi.pay(pendingPay, { fecha_pago: new Date().toISOString().slice(0, 10) });
      toast({ title: 'Comision pagada' });
      load();
    } catch (err: any) { toast({ title: 'Error', description: err?.data?.error, variant: 'destructive' }); }
    finally { setPendingPay(null); }
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={isAdmin ? 'Comisiones' : 'Mis comisiones'}
        subtitle={isAdmin ? 'Comisiones generadas a partir de las ventas (round-robin -> regla -> conversion)' : 'Tu acumulado por ventas'}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={handleExport}
              aria-label="Exportar"
              title="Exportar (Excel/CSV/JSON)"
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-xs font-medium hover:bg-muted text-muted-foreground hover:text-foreground"
            >
              <DownloadSimple size={14} weight="bold" /> <span className="hidden sm:inline">Exportar</span>
            </button>
            {isAdmin && periodMode === 'month' && (
              <button
                onClick={() => setClosingMonth(true)}
                aria-label="Cerrar mes"
                title={`Cierra ${monthLabel(year, month)} para snapshot inmutable`}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-warning/30 bg-warning-soft text-warning-soft-foreground text-xs font-semibold hover:bg-warning-soft"
              >
                <Lock size={14} weight="bold" /> <span className="hidden sm:inline">Cerrar mes</span>
              </button>
            )}
            {isAdmin && user?.role === 'superadmin' && (
              <button onClick={() => setRulesOpen(true)} className="inline-flex items-center gap-2 h-9 px-3 sm:px-4 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90">
                <Gear size={14} weight="bold" /> <span className="hidden sm:inline">Reglas (% por gestor)</span><span className="sm:hidden">Reglas</span>
              </button>
            )}
          </div>
        }
      />

      {/* Filtro de periodo (CRM-137 + CRM-138) */}
      <div className="bg-card border border-border rounded-lg p-3 flex items-center gap-2 flex-wrap">
        <CalendarBlank size={16} className="text-muted-foreground flex-shrink-0" weight="regular" />
        <button
          onClick={() => setPeriodMode('month')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${periodMode === 'month' ? 'bg-primary text-white' : 'bg-muted hover:bg-muted/80'}`}
        >
          Mes/año
        </button>
        <button
          onClick={() => setPeriodMode('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${periodMode === 'all' ? 'bg-primary text-white' : 'bg-muted hover:bg-muted/80'}`}
        >
          Todo el histórico
        </button>
        {periodMode === 'month' && (
          <>
            <Select<number>
              value={month}
              onChange={setMonth}
              options={Array.from({ length: 12 }, (_, i) => ({
                value: i + 1,
                label: new Date(2000, i, 1).toLocaleDateString('es-ES', { month: 'long' }),
              }))}
              ariaLabel="Mes"
              className="w-36"
            />
            <input
              type="number"
              min="2020"
              max="2099"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              aria-label="Año"
              className={inputClass + ' w-20'}
            />
            <button
              onClick={() => { const d = new Date(); d.setMonth(d.getMonth() - 1); setMonth(d.getMonth() + 1); setYear(d.getFullYear()); }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Mes anterior
            </button>
            <button
              onClick={() => { const d = new Date(); setMonth(d.getMonth() + 1); setYear(d.getFullYear()); }}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Mes actual
            </button>
          </>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {filteredItems.length} comisión{filteredItems.length !== 1 ? 'es' : ''} en {periodLabel}
        </span>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KpiCard icon={ChartBar} label="Total generado" value={fmt(stats.total)} />
          <KpiCard icon={CheckCircle} label="Pagado" value={fmt(stats.pagado)} iconBg="bg-success-soft text-success-soft-foreground" />
          <KpiCard icon={Clock} label="Pendiente" value={fmt(stats.pendiente)} iconBg="bg-warning-soft text-warning-soft-foreground" />
          <KpiCard icon={CurrencyEur} label="Comisiones" value={stats.cantidad} />
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="p-4 border-b border-border flex items-center gap-2 flex-wrap">
          {ESTADOS.map(e => (
            <button key={e.v} onClick={() => setFilterEstado(e.v)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${filterEstado === e.v ? 'bg-primary text-white' : 'bg-muted hover:bg-muted/80'}`}>
              {e.label}
            </button>
          ))}
          {isAdmin && users.length > 0 && (
            <Select<string>
              value={filterUser}
              onChange={setFilterUser}
              options={[
                { value: '', label: 'Todos los gestores' },
                ...users.map(u => ({ value: String(u.id), label: u.nombre })),
              ]}
              ariaLabel="Filtrar por gestor"
              className="ml-auto w-48"
            />
          )}
        </div>

        {/* Bulk actions bar (CRM-138) */}
        {isAdmin && selected.size > 0 && (
          <div className="px-4 py-2 border-b border-border bg-primary/5 flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-semibold text-primary">
              {selected.size} seleccionada{selected.size !== 1 ? 's' : ''} para pagar
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Limpiar selección
              </button>
              <button
                onClick={() => setBulkPay(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-success text-white text-xs font-semibold hover:bg-success"
              >
                <CheckCircle size={12} weight="bold" /> Marcar todas como pagadas
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <SkeletonTable rows={5} columns={6} className="border-0" />
        ) : filteredItems.length === 0 ? (
          <EmptyState
            icon={CurrencyEur}
            title="Sin comisiones"
            description={
              periodMode === 'month'
                ? `No hay comisiones en ${periodLabel}. Cambia el periodo o el filtro.`
                : isAdmin ? 'Aun no se han generado comisiones. Asegurate de tener reglas creadas.' : 'No tienes comisiones aun. Cierra ventas para empezar a acumular.'
            }
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="tabla-cifras w-full text-sm">
                <thead className="bg-muted/50 text-[11px] text-muted-foreground">
                  <tr>
                    {isAdmin && (
                      <th className="px-3 py-2.5 w-9">
                        {pendingInPeriod.length > 0 && (
                          <input
                            type="checkbox"
                            checked={allPendingSelected}
                            onChange={toggleSelectAll}
                            aria-label="Seleccionar todas las pendientes"
                            className="accent-primary cursor-pointer"
                          />
                        )}
                      </th>
                    )}
                    <th className="text-left px-4 py-2.5 font-bold">Fecha</th>
                    {isAdmin && <th className="text-left px-4 py-2.5 font-bold">Gestor</th>}
                    <th className="text-left px-4 py-2.5 font-bold">Cliente / Producto</th>
                    <th className="text-right px-4 py-2.5 font-bold">Base cobrada</th>
                    <th className="text-right px-4 py-2.5 font-bold">%</th>
                    <th className="text-right px-4 py-2.5 font-bold">Comision</th>
                    <th className="text-left px-4 py-2.5 font-bold">Estado</th>
                    {isAdmin && <th className="px-4 py-2.5"></th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map(r => (
                    <tr key={r.id} className={`border-b last:border-0 hover:bg-muted/30 ${selected.has(r.id) ? 'bg-primary/5' : ''}`}>
                      {isAdmin && (
                        <td className="px-3 py-3">
                          {r.estado === 'pendiente' && Number(r.importe_comision) > 0 && (
                            <input
                              type="checkbox"
                              checked={selected.has(r.id)}
                              onChange={() => toggleSelect(r.id)}
                              aria-label={`Seleccionar comisión ${r.id}`}
                              className="accent-primary cursor-pointer"
                            />
                          )}
                        </td>
                      )}
                      <td className="px-4 py-3 text-muted-foreground">{formatDate(r.created_at)}</td>
                      {isAdmin && <td className="px-4 py-3 font-semibold">{r.user_nombre}</td>}
                      <td className="px-4 py-3">
                        <div className="font-semibold">{r.lead_nombre}</div>
                        <div className="text-xs text-muted-foreground">{r.product_nombre || r.producto_contratado || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmt(r.importe_base)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.pct}%</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold">{fmt(r.importe_comision)}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          r.estado === 'pagado' ? 'bg-success-soft text-success-soft-foreground' :
                          r.estado === 'cancelado' ? 'bg-muted text-muted-foreground' :
                          'bg-warning-soft text-warning-soft-foreground'
                        }`}>{r.estado}</span>
                        {r.fecha_pago && <p className="text-[10px] text-muted-foreground mt-0.5">{formatDate(r.fecha_pago)}</p>}
                      </td>
                      {isAdmin && (
                        <td className="px-4 py-3 text-right">
                          {r.estado === 'pendiente' && Number(r.importe_comision) > 0 && (
                            <button onClick={() => handlePay(r.id)} className="px-2 py-1 rounded bg-success-soft text-success text-[11px] font-semibold hover:bg-success-soft">
                              Pagar
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {filteredItems.map(r => (
                <div key={r.id} className="p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{r.lead_nombre}</div>
                      <div className="text-xs text-muted-foreground truncate">{r.product_nombre || r.producto_contratado || '—'}</div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                      r.estado === 'pagado' ? 'bg-success-soft text-success-soft-foreground' :
                      r.estado === 'cancelado' ? 'bg-muted text-muted-foreground' :
                      'bg-warning-soft text-warning-soft-foreground'
                    }`}>{r.estado}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div>
                      <div className="text-xs text-muted-foreground">Base</div>
                      <div className="tabular-nums">{fmt(r.importe_base)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">%</div>
                      <div className="tabular-nums">{r.pct}%</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Comision</div>
                      <div className="tabular-nums font-semibold">{fmt(r.importe_comision)}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="text-muted-foreground">
                      {formatDate(r.created_at)}
                      {isAdmin && r.user_nombre && <span> · <span className="font-medium text-foreground">{r.user_nombre}</span></span>}
                    </div>
                    {isAdmin && r.estado === 'pendiente' && Number(r.importe_comision) > 0 && (
                      <button onClick={() => handlePay(r.id)} className="px-2 py-1 rounded bg-success-soft text-success text-[11px] font-semibold hover:bg-success-soft flex-shrink-0">
                        Pagar
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <Suspense fallback={null}>
        {rulesOpen && <RulesDialog onClose={() => setRulesOpen(false)} onSaved={load} />}
      </Suspense>
      <ConfirmDialog open={pendingPay !== null} title="¿Marcar como pagada?" message="Se registrará la comisión como pagada con la fecha de hoy." tone="default" confirmLabel="Confirmar" onConfirm={doPay} onCancel={() => setPendingPay(null)} />
      <ConfirmDialog
        open={bulkPay}
        title={`¿Marcar ${selected.size} comisión${selected.size !== 1 ? 'es' : ''} como pagadas?`}
        message="Todas se marcarán con la fecha de hoy. Esta acción no se puede deshacer."
        tone="default"
        confirmLabel="Sí, marcar pagadas"
        onConfirm={handleBulkPay}
        onCancel={() => setBulkPay(false)}
      />
      <ConfirmDialog
        open={closingMonth}
        title={`¿Cerrar ${monthLabel(year, month)}?`}
        message="Una vez cerrado, las comisiones de este mes serán inmutables. No podrás añadir, editar ni eliminar comisiones del periodo. Esta acción no se puede deshacer."
        tone="warning"
        confirmLabel="Cerrar mes"
        onConfirm={handleCloseMonth}
        onCancel={() => setClosingMonth(false)}
      />

      <Suspense fallback={null}>
        <ExportDialog
          open={exportOpen}
          onClose={() => setExportOpen(false)}
          context="commissions"
          title="Exportar comisiones"
          filename={`comisiones-${periodLabel.replace(/\s+/g, '_').toLowerCase()}`}
          columns={getCommissionExportColumns()}
          rows={filteredItems}
        />
      </Suspense>
    </div>
  );
}
