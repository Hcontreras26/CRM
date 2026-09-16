import PageHeader from '@/shared/components/ui/PageHeader';
import { lazy, Suspense, useState, useEffect } from 'react';
import { Plus, Receipt, UsersThree, CaretDown, User, Users, Robot } from '@phosphor-icons/react';
import usePermission from '@/shared/hooks/usePermission';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import client from '@/shared/api/client';

const RegisterSaleDialog = lazy(() => import('../components/RegisterSaleDialog'));
const CursosVendidosCard = lazy(() => import('../components/CursosVendidosCard'));
const MyGoalCard = lazy(() => import('../components/MyGoalCard'));
const GestoresStatsTable = lazy(() => import('../components/GestoresStatsTable'));
const DesgloseVentas = lazy(() => import('../components/DesgloseVentas'));
const ResumenVentas = lazy(() => import('../components/ResumenVentas'));
const EvolucionVentas = lazy(() => import('../components/EvolucionVentas'));
const VentasPorPais = lazy(() => import('../components/VentasPorPais'));
const ClientesVentas = lazy(() => import('../components/ClientesVentas'));
import FiltroPeriodo, { useEstadoPeriodo } from '../components/FiltroPeriodo';

export default function SalesPage() {
  const { activeProject, activeIssuerId } = useProjectContext() as {
    activeProject: { id: number; nombre?: string } | null;
    activeIssuerId: number | null;
  };
  const { user } = useAuth() as { user: { role?: string } | null };
  const isAdmin = user?.role === 'admin' || user?.role === 'superadmin';
  const [open, setOpen] = useState(false);
  // CON QUE TIPO SE ABRE. Diego, 25/09: «registrar venta automatica (sin
  // gestora) y venta propia como un desplegable dentro de ese boton», y luego
  // «para el caso del admin tambien: registrar venta de otra gestora».
  const [modoVenta, setModoVenta] = useState<'existing' | 'otra_gestora' | 'sin_gestora'>('existing');
  const [menuAbierto, setMenuAbierto] = useState(false);
  const { can } = usePermission();
  const puedeSinGestora = can('conversions.sin_gestora');
  // Registrar una venta a nombre de otra persona es reasignar dinero: lo mismo
  // que hace falta para reasignar prospectos.
  const puedeDeOtra = can('leads.assign') || can('leads.reassign');

  function abrirVenta(modo: 'existing' | 'otra_gestora' | 'sin_gestora') {
    setModoVenta(modo);
    setMenuAbierto(false);
    setOpen(true);
  }
  // -1 = "Todos los proyectos" del header. En ese caso pasamos null al backend
  // para que agregue cross-proyecto. Si NO hay proyecto activo, ni siquiera el
  // header está listo todavía.
  const hasActiveCtx = !!activeProject?.id;
  const allProjects = activeProject?.id === -1;
  // Con una EMPRESA puesta si se puede registrar: el dialogo pregunta el campus.
  // Sin empresa y en «todos los proyectos» no, que ahi no hay de donde elegir.
  const puedeRegistrar = !!activeProject?.id && (!allProjects || !!activeIssuerId);
  const projectIdParam = hasActiveCtx && !allProjects ? activeProject!.id : null;
  // Con una sociedad elegida, Ventas enseña sus campus sumados —igual que
  // Reportes—, en vez del muro de «elige un proyecto». El servidor traduce el
  // `issuerId` a la lista de proyectos y las consultas no se enteran.
  const issuerIdParam = activeIssuerId ?? null;

  // El periodo de la pantalla, elegido UNA vez: antes cada tarjeta traía el
  // suyo y en la misma vista convivían cuatro criterios distintos, así que los
  // números no se podían comparar entre sí.
  // Arranca en el año en curso: un mes recién empezado sale en blanco —ISEIE
  // no tiene ventas en agosto— y la pantalla parecía rota. «Mes» está a un clic.
  const { periodo, setPeriodo, desde, hasta, onFechas, rango, mes } = useEstadoPeriodo('ytd');

  // Filtro por gestora/vendedora (solo admin/superadmin). Las tarjetas ya
  // soportan responsableId; aquí solo lo elegimos.
  const [gestores, setGestores] = useState<Array<{ id: number; nombre: string }>>([]);
  const [responsableId, setResponsableId] = useState<number | null>(null);
  useEffect(() => {
    if (!isAdmin) return;
    const pid = projectIdParam ? `&projectId=${projectIdParam}` : '';
    client.get(`/users?limit=100${pid}`).then((r) => setGestores(r.success ? (r.data || []) : [])).catch(() => {});
  }, [isAdmin, projectIdParam]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={allProjects ? 'Ventas · Todos los proyectos' : 'Ventas'}
        subtitle={allProjects
          ? 'Vista agregada de todos los proyectos. Para registrar una venta entra en un proyecto concreto.'
          : 'Registra ventas — del día o históricas. Crea cliente + conversión + pago en un solo paso.'}
        actions={(
          <>
          {isAdmin && !allProjects && (
            <div className="flex items-center gap-1.5 h-9 px-2.5 rounded-md border border-border bg-card text-sm">
              <UsersThree size={14} className="text-muted-foreground" />
              <select
                value={responsableId ?? ''}
                onChange={(e) => setResponsableId(e.target.value ? Number(e.target.value) : null)}
                className="bg-transparent focus:outline-none max-w-[160px]"
                title="Filtrar por gestora"
              >
                <option value="">Todas las gestoras</option>
                {gestores.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
              </select>
            </div>
          )}
          {/* NUEVA VENTA, con sus tipos dentro.
              Quien no tiene mas que uno ve el boton de siempre: un desplegable
              de una sola opcion es un clic de mas por nada. */}
          {(puedeSinGestora || puedeDeOtra) ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuAbierto((v) => !v)}
                disabled={!puedeRegistrar}
                aria-haspopup="menu"
                aria-expanded={menuAbierto}
                title={!puedeRegistrar ? 'Elige un proyecto o una empresa para registrar una venta' : ''}
                className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                <Plus size={14} weight="bold" />
                Nueva venta
                <CaretDown size={12} weight="bold" className={menuAbierto ? 'rotate-180 transition-transform' : 'transition-transform'} />
              </button>
              {menuAbierto && (
                <>
                  {/* Pulsar fuera lo cierra. Sin esto el menu se queda abierto
                      encima de la tabla y hay que volver al boton. */}
                  <div className="fixed inset-0 z-10" onClick={() => setMenuAbierto(false)} aria-hidden="true" />
                  <div role="menu" className="absolute right-0 z-20 mt-1 w-72 overflow-hidden rounded-md border border-border bg-card shadow-lg">
                    <button
                      type="button" role="menuitem" onClick={() => abrirVenta('existing')}
                      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted"
                    >
                      <User size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                      <span>
                        <span className="block text-sm font-semibold">Venta propia</span>
                        <span className="block text-[11px] text-muted-foreground">La registras tú y cuenta para ti.</span>
                      </span>
                    </button>
                    {puedeDeOtra && (
                      <button
                        type="button" role="menuitem" onClick={() => abrirVenta('otra_gestora')}
                        className="flex w-full items-start gap-2.5 border-t border-border px-3 py-2.5 text-left hover:bg-muted"
                      >
                        <Users size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                        <span>
                          <span className="block text-sm font-semibold">Venta de otra gestora</span>
                          <span className="block text-[11px] text-muted-foreground">Eliges el prospecto y la venta queda de quien lo lleva.</span>
                        </span>
                      </button>
                    )}
                    {puedeSinGestora && (
                      <button
                        type="button" role="menuitem" onClick={() => abrirVenta('sin_gestora')}
                        className="flex w-full items-start gap-2.5 border-t border-border px-3 py-2.5 text-left hover:bg-muted"
                      >
                        <Robot size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
                        <span>
                          <span className="block text-sm font-semibold">Venta automática (sin gestora)</span>
                          <span className="block text-[11px] text-muted-foreground">La registra la plataforma, de cero: no cuenta para ninguna gestora.</span>
                        </span>
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => abrirVenta('existing')}
              disabled={!puedeRegistrar}
              title={!puedeRegistrar ? 'Elige un proyecto o una empresa para registrar una venta' : ''}
              className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus size={14} weight="bold" />
              Nueva venta
            </button>
          )}
          </>
        )}
      />

      {hasActiveCtx && !allProjects && (
        <FiltroPeriodo
          valor={periodo} onChange={setPeriodo}
          desde={desde} hasta={hasta} onFechas={onFechas}
        />
      )}

      {!hasActiveCtx ? (
        <div className="bg-warning-soft border border-warning/30 rounded-lg p-6 text-center text-sm text-warning-soft-foreground">
          Cargando proyectos…
        </div>
      ) : (
        <>
          <Suspense fallback={null}>
            <ResumenVentas projectId={projectIdParam} issuerId={issuerIdParam} from={rango.from} to={rango.to} responsableId={responsableId} />
          </Suspense>

          <Suspense fallback={null}>
            <CursosVendidosCard projectId={projectIdParam} issuerId={issuerIdParam} responsableId={responsableId} from={rango.from} to={rango.to} />
          </Suspense>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* «Mi meta» es de quien vende. Un admin o superadmin no tiene
                ventas propias y la tarjeta le salia siempre a cero. */}
            {!isAdmin && (
              <Suspense fallback={null}>
                <MyGoalCard projectId={projectIdParam} issuerId={issuerIdParam} periodo={mes} />
              </Suspense>
            )}
          </div>

          {/* Cómo va contra el periodo anterior, y el año mes a mes. Lo ve
              también la gestora: el servidor le devuelve solo lo suyo. */}
          {!allProjects && (
            <Suspense fallback={null}>
              <EvolucionVentas projectId={projectIdParam} issuerId={issuerIdParam} from={rango.from} to={rango.to} responsableId={responsableId} />
            </Suspense>
          )}

          {!allProjects && (
            <Suspense fallback={null}>
              <DesgloseVentas projectId={projectIdParam} issuerId={issuerIdParam} from={rango.from} to={rango.to} responsableId={responsableId} />
            </Suspense>
          )}

          {!allProjects && (
            <Suspense fallback={null}>
              <VentasPorPais projectId={projectIdParam} issuerId={issuerIdParam} from={rango.from} to={rango.to} responsableId={responsableId} />
            </Suspense>
          )}

          {!allProjects && (
            <Suspense fallback={null}>
              <ClientesVentas projectId={projectIdParam} issuerId={issuerIdParam} from={rango.from} to={rango.to} responsableId={responsableId} />
            </Suspense>
          )}

          {isAdmin && (
            <Suspense fallback={null}>
              <GestoresStatsTable projectId={projectIdParam} issuerId={issuerIdParam} canEdit={!allProjects} periodo={mes} />
            </Suspense>
          )}

          {!allProjects && (
            <div className="bg-card border border-border rounded-lg p-6 text-center text-muted-foreground text-sm">
              <Receipt size={32} weight="duotone" className="mx-auto mb-2 text-muted-foreground/50" />
              Pulsa <strong>+ Nueva venta</strong> para registrar una sobre un cliente nuevo o existente.
              <p className="text-xs mt-1 opacity-70">Por la fecha indicada se marca como histórica (anterior a hoy) o del día.</p>
            </div>
          )}

          {/* Los números de Análisis · Reportes, aquí abajo: se mira Ventas a
              diario y no debería hacer falta cambiar de sección para saber
              cómo va el mes. Son los mismos paneles, no una copia. */}
        </>
      )}

      <Suspense fallback={null}>
        <RegisterSaleDialog
          open={open}
          modoInicial={modoVenta}
          project={activeProject}
          onClose={() => setOpen(false)}
          onSaved={() => setOpen(false)}
        />
      </Suspense>
    </div>
  );
}
