import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useProjectContext } from '@/contexts/ProjectContext';
import client from '@/shared/api/client';
import PageHeader from '@/shared/components/ui/PageHeader';
import usePermission from '@/shared/hooks/usePermission';
import EmptyState from '@/shared/components/ui/EmptyState';
import SkeletonTable from '@/shared/components/ui/SkeletonTable';
import Select from '@/shared/components/ui/Select';
import { GraduationCap, Eye, PlugsConnected, Certificate, ChatText } from '@phosphor-icons/react';
import { toast } from '@/shared/hooks/useToast';
import PromptDialog from '@/shared/components/ui/PromptDialog';
import WebhooksTab from '../components/WebhooksTab';
import MatriculaDetail from '../components/MatriculaDetail';
import { SOLO_EN_PRUEBAS } from '@/shared/lib/soloEnPruebas';

// Certificaciones (Certifex). Diego, 30/09: «meterlo en la parte de matrículas en
// una subsección que sea certificaciones [...] cuando alguien termina la formación,
// en el CRM aprobamos y Certifex emite». Carga aparte: es una pantalla grande y
// solo la abre administración.
const CertifexEmisionesPage = lazy(() => import('@/modules/certifex/pages/CertifexEmisionesPage'));
const CertifexConsultasPage = lazy(() => import('@/modules/certifex/pages/CertifexConsultasPage'));

const ESTADO_LABEL = {
  solicitud_admision: 'Solicitud admisión',
  datos_validados: 'Datos validados',
  pendiente: 'Pendiente',
  validada: 'Validada',
  rechazada: 'Rechazada',
};
// CINCO ESTADOS, CINCO ASPECTOS. Tres son semánticos de libro —pendiente,
// validada, rechazada—. Los otros dos son pasos de un recorrido y no dicen si
// algo va bien o mal; antes eran sky e indigo, que no significan nada.
//
// Ahora: lo que acaba de llegar y nadie ha tocado se pinta neutro, y lo que ya
// avanzó un paso se pinta como información. Si los dos cayeran en `info` —que
// es lo que hizo la sustitución automática— dejarían de distinguirse, y esta
// tabla existe justamente para distinguirlos.
const ESTADO_COLOR = {
  solicitud_admision: 'bg-muted text-muted-foreground border-border',
  datos_validados: 'bg-info-soft text-info-soft-foreground border-info/30',
  pendiente: 'bg-warning-soft text-warning-soft-foreground border-warning/30',
  validada: 'bg-success-soft text-success-soft-foreground border-success/30',
  rechazada: 'bg-destructive-soft text-destructive-soft-foreground border-destructive/30',
};

export default function MatriculasPage() {
  const { activeProject } = useProjectContext();
  const { can, tieneRol } = usePermission();
  const [tab, setTab] = useState('list');
  // Certificaciones tiene dirección propia (/clientes/matriculas/certificaciones):
  // la campana enlaza ahí y no depende del proyecto elegido, porque Certifex va por
  // campus de Certifex, no por proyecto del CRM.
  const location = useLocation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Certificaciones (Certifex) está EN DESARROLLO, la lleva Ángel: solo en pruebas.
  // En producción la dirección cae en el listado (Diego, 07/10).
  const enCertificaciones = SOLO_EN_PRUEBAS && location.pathname.replace(/\/$/, '').endsWith('/certificaciones');
  // Los mismos roles que la API: emitir es de administración; las consultas de la web
  // las ve también soporte.
  const verEmisiones = tieneRol('superadmin', 'admin');
  const verConsultas = tieneRol('superadmin', 'admin', 'soporte');
  const vistaCert = params.get('vista') === 'consultas' || !verEmisiones ? 'consultas' : 'emisiones';
  const [data, setData] = useState([]);
  const [stats, setStats] = useState<{ total: number; pendientes: number; validadas: number; rechazadas: number }>({ total: 0, pendientes: 0, validadas: 0, rechazadas: 0 });
  const [loading, setLoading] = useState(true);
  const [filterEstado, setFilterEstado] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [rechazoTarget, setRechazoTarget] = useState(null);

  const load = useCallback(async () => {
    if (!activeProject?.id) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ projectId: activeProject.id });
      if (filterEstado) params.set('estado', filterEstado);
      if (search.trim()) params.set('search', search.trim());
      const res = await client.get(`/matriculas?${params}`);
      if (res.success) {
        setData(res.data || []);
        const s = (res.stats || {}) as Partial<typeof stats>;
        setStats({ total: s.total ?? 0, pendientes: s.pendientes ?? 0, validadas: s.validadas ?? 0, rechazadas: s.rechazadas ?? 0 });
      }
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally { setLoading(false); }
  }, [activeProject?.id, filterEstado, search]);

  useEffect(() => { load(); }, [load]);

  async function handleEstado(m, estado) {
    if (estado === 'rechazada') {
      setRechazoTarget(m);
      return;
    }
    try {
      await client.post(`/matriculas/${m.id}/estado`, { estado, motivo_rechazo: null });
      toast({ title: 'Validada' });
      load();
      if (detail?.id === m.id) setDetail(null);
    } catch (err) { toast({ title: 'Error', description: err?.data?.error, variant: 'destructive' }); }
  }

  async function confirmRechazo(motivo) {
    if (!rechazoTarget || !motivo) return;
    const m = rechazoTarget;
    setRechazoTarget(null);
    try {
      await client.post(`/matriculas/${m.id}/estado`, { estado: 'rechazada', motivo_rechazo: motivo });
      toast({ title: 'Rechazada' });
      load();
      if (detail?.id === m.id) setDetail(null);
    } catch (err) { toast({ title: 'Error', description: err?.data?.error, variant: 'destructive' }); }
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Matrículas"
        subtitle={enCertificaciones
          ? 'Certificaciones: quien termina la formación se aprueba aquí, y Certifex emite su título'
          : `${stats.total || 0} matrículas en ${activeProject?.nombre || 'este proyecto'}`}
      />

      <div className="flex border-b border-border">
        <button
          onClick={() => { setTab('list'); if (enCertificaciones) navigate('/clientes/matriculas'); }}
          className={`flex items-center gap-2 px-3 h-9 text-sm font-bold border-b-2 focus:outline-none focus:ring-2 focus:ring-primary/40 ${!enCertificaciones && tab === 'list' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
        >
          <GraduationCap size={14} /> Listado
        </button>
        <button
          onClick={() => { setTab('webhooks'); if (enCertificaciones) navigate('/clientes/matriculas'); }}
          className={`flex items-center gap-2 px-3 h-9 text-sm font-bold border-b-2 focus:outline-none focus:ring-2 focus:ring-primary/40 ${!enCertificaciones && tab === 'webhooks' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
        >
          <PlugsConnected size={14} /> <span className="hidden sm:inline">Webhooks de admisión</span><span className="sm:hidden">Webhooks</span>
        </button>
        {SOLO_EN_PRUEBAS && verConsultas && (
          <button
            onClick={() => navigate('/clientes/matriculas/certificaciones')}
            className={`flex items-center gap-2 px-3 h-9 text-sm font-bold border-b-2 focus:outline-none focus:ring-2 focus:ring-primary/40 ${enCertificaciones ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}
          >
            <Certificate size={14} /> Certificaciones
          </button>
        )}
      </div>

      {enCertificaciones ? (
        !verConsultas ? (
          <EmptyState icon={Certificate} title="Solo administración" description="Las certificaciones las aprueba y emite administración." />
        ) : (
          <div className="space-y-4">
            {verEmisiones && (
              <div className="flex items-center gap-1">
                {[
                  { clave: 'emisiones', rotulo: 'Emisiones', icono: Certificate },
                  { clave: 'consultas', rotulo: 'Consultas de la web', icono: ChatText },
                ].map(({ clave, rotulo, icono: Icono }) => (
                  <button
                    key={clave}
                    type="button"
                    aria-pressed={vistaCert === clave}
                    onClick={() => setParams(clave === 'consultas' ? { vista: 'consultas' } : {}, { replace: true })}
                    className={`h-8 px-3 rounded-md border text-xs font-medium inline-flex items-center gap-1.5 transition-colors ${
                      vistaCert === clave
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground'}`}
                  >
                    <Icono size={13} /> {rotulo}
                  </button>
                ))}
              </div>
            )}
            <Suspense fallback={<SkeletonTable rows={5} columns={6} />}>
              {vistaCert === 'consultas' ? <CertifexConsultasPage embebida /> : <CertifexEmisionesPage embebida />}
            </Suspense>
          </div>
        )
      ) : tab === 'webhooks' ? <WebhooksTab project={activeProject} /> : <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {[
          { label: 'Total', value: stats.total, color: '#64748b' },
          { label: 'Pendientes', value: stats.pendientes, color: '#d97706' },
          { label: 'Validadas', value: stats.validadas, color: '#059669' },
          { label: 'Rechazadas', value: stats.rechazadas, color: '#dc2626' },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded-xl p-3 border-b-2" style={{ borderBottomColor: k.color }}>
            <p className="text-[11px] font-bold uppercase text-muted-foreground">{k.label}</p>
            <p className="text-xl font-extrabold mt-0.5" style={{ color: k.color }}>{k.value || 0}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <input
          type="search"
          placeholder="Buscar nombre/email/DNI..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="Buscar matrículas"
          className="flex-1 min-w-[200px] h-9 px-3 rounded-lg border border-border bg-card text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/40"
        />
        <Select<string>
          value={filterEstado}
          onChange={setFilterEstado}
          options={[
            { value: '', label: 'Todos los estados' },
            { value: 'solicitud_admision', label: 'Solicitud admisión' },
            { value: 'datos_validados', label: 'Datos validados' },
            { value: 'pendiente', label: 'Pendientes' },
            { value: 'validada', label: 'Validadas' },
            { value: 'rechazada', label: 'Rechazadas' },
          ]}
          ariaLabel="Filtrar por estado"
          className="w-48"
        />
      </div>

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {loading ? <SkeletonTable rows={5} columns={6} /> : data.length === 0 ? (
          <EmptyState icon={GraduationCap} title="Sin matrículas" description="Aparece aquí cuando se crea una matrícula desde una conversión" />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-[11px] uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-bold">Lead</th>
                    <th className="text-left px-4 py-2.5 font-bold">DNI</th>
                    <th className="text-left px-4 py-2.5 font-bold">Producto</th>
                    <th className="text-right px-4 py-2.5 font-bold">Importe</th>
                    <th className="text-center px-4 py-2.5 font-bold">Estado</th>
                    <th className="px-4 py-2.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(m => (
                    <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{m.lead_nombre || '—'}</div>
                        <div className="text-xs text-muted-foreground">{m.lead_email}</div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{m.dni || '—'}</td>
                      <td className="px-4 py-3 text-xs">{m.producto_contratado || '—'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{Number(m.importe_total || 0).toFixed(2)} €</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${ESTADO_COLOR[m.estado]}`}>{ESTADO_LABEL[m.estado]}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => setDetail(m)}
                          aria-label="Ver detalle de matrícula"
                          className="p-1.5 rounded hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary/40"
                        >
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-border">
              {data.map(m => (
                <div key={m.id} className="p-3 flex items-start gap-3 hover:bg-muted/30">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${ESTADO_COLOR[m.estado]}`}>{ESTADO_LABEL[m.estado]}</span>
                      <span className="text-sm font-bold tabular-nums">{Number(m.importe_total || 0).toFixed(2)} €</span>
                    </div>
                    <p className="text-sm font-semibold truncate">{m.lead_nombre || '—'}</p>
                    <p className="text-[11px] text-muted-foreground truncate">{m.lead_email}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {m.producto_contratado || 'Sin producto'}{m.dni ? ` · ${m.dni}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => setDetail(m)}
                      aria-label="Ver detalle de matrícula"
                      className="h-8 w-8 inline-flex items-center justify-center rounded hover:bg-muted text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <Eye size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      </>}

      {detail && <MatriculaDetail matricula={detail} onClose={() => setDetail(null)} onChange={load} onEstado={can('matriculas.edit') ? handleEstado : undefined} />}
      <PromptDialog
        open={!!rechazoTarget}
        title="Rechazar matrícula"
        message="Indica el motivo del rechazo para que el solicitante pueda recibirlo."
        placeholder="Ej: documentación incompleta o ilegible…"
        multiline
        confirmLabel="Rechazar"
        onConfirm={confirmRechazo}
        onCancel={() => setRechazoTarget(null)}
      />
    </div>
  );
}
