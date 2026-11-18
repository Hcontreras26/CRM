import { useEffect, useState } from 'react';
import type { Icon as PhosphorIcon } from '@phosphor-icons/react';
import { useProjectContext } from '@/contexts/ProjectContext';
import client from '@/shared/api/client';
import usePermission from '@/shared/hooks/usePermission';
import CorreosEnviados from '../components/CorreosEnviados';
import PiezasDelSistema from '../components/PiezasDelSistema';
import PageHeader from '@/shared/components/ui/PageHeader';
import {
  CheckCircle, WarningCircle, ArrowClockwise,
  EnvelopeSimple, ChartBar, MagnifyingGlass, CreditCard, ShoppingBag,
} from '@phosphor-icons/react';

type ServiceKey = 'brevo' | 'meta' | 'google_ads' | 'gsc' | 'stripe' | 'woocommerce';
type Status = 'ok' | 'missing' | 'loading';

interface Integration {
  service: ServiceKey;
  name: string;
  desc: string;
  icon: PhosphorIcon;
  color: string;
}

interface Credential {
  service: ServiceKey | string;
}

interface WooCredential {
  store_url?: string | null;
}

const INTEGRATIONS: ReadonlyArray<Integration> = [
  { service: 'brevo', name: 'Brevo', desc: 'Email transaccional y notificaciones', icon: EnvelopeSimple, color: 'text-blue-500' },
  { service: 'meta', name: 'Meta Marketing', desc: 'Meta Ads API — campañas y estadísticas', icon: ChartBar, color: 'text-blue-600' },
  { service: 'google_ads', name: 'Google Ads', desc: 'Google Ads API — campañas y métricas', icon: ChartBar, color: 'text-amber-500' },
  { service: 'gsc', name: 'Google Search Console', desc: 'Datos de tráfico orgánico y SEO', icon: MagnifyingGlass, color: 'text-green-600' },
  { service: 'stripe', name: 'Stripe', desc: 'Pagos, suscripciones y métricas SaaS', icon: CreditCard, color: 'text-violet-600' },
  { service: 'woocommerce', name: 'WooCommerce', desc: 'Sincronización de productos e importación', icon: ShoppingBag, color: 'text-orange-500' },
];

function StatusBadge({ status }: { status: Status }) {
  if (status === 'ok') return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200/60 dark:border-emerald-800/40 px-2.5 py-1 rounded-full">
      <CheckCircle size={13} weight="fill" /> Configurado
    </span>
  );
  if (status === 'missing') return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-600 bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/40 px-2.5 py-1 rounded-full">
      <WarningCircle size={13} weight="fill" /> Sin credenciales
    </span>
  );
  return (
    <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground bg-muted border border-border px-2.5 py-1 rounded-full">
      <WarningCircle size={13} /> Comprobando…
    </span>
  );
}

export default function StatusPage() {
  const { activeProject } = useProjectContext();
  // Cada bloque, con su permiso (#631): sin él el servidor da 403, así que ni se
  // pide ni se pinta. Las piezas y los correos son `status.view`; las
  // credenciales, `credentials.view`, y la de WooCommerce, `woocommerce.view`
  // (el admin la ve, pero no las demás credenciales).
  const { can } = usePermission();
  const veEstado = can('status.view');
  const veCredenciales = can('credentials.view');
  const veWoo = can('woocommerce.view');
  const integraciones = INTEGRATIONS.filter((i) => (i.service === 'woocommerce' ? veWoo : veCredenciales));
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [woo, setWoo] = useState<WooCredential | null>(null);
  const [loading, setLoading] = useState(true);

  async function load(): Promise<void> {
    if (!activeProject?.id) return;
    setLoading(true);
    try {
      const nada = { success: false, data: null };
      const [credRes, wooRes] = await Promise.all([
        veCredenciales ? client.get(`/credentials?projectId=${activeProject.id}`) : Promise.resolve(nada),
        veWoo
          ? client.get(`/woocommerce/credentials?projectId=${activeProject.id}`).catch(() => nada)
          : Promise.resolve(nada),
      ]);
      if (credRes.success) setCredentials((credRes.data as Credential[]) || []);
      if (wooRes.success) setWoo((wooRes as { data?: WooCredential }).data || null);
    } catch {}
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [activeProject?.id, veCredenciales, veWoo]);

  function getStatus(service: ServiceKey): Status {
    if (service === 'woocommerce') return woo?.store_url ? 'ok' : 'missing';
    return credentials.find(c => c.service === service) ? 'ok' : 'missing';
  }

  const configured = integraciones.filter(i => getStatus(i.service) === 'ok').length;

  return (
    <div className="space-y-6 pb-8">
      <PageHeader
        title="Estado del sistema"
        subtitle={activeProject ? (integraciones.length ? `${activeProject.nombre} — ${configured}/${integraciones.length} integraciones configuradas` : activeProject.nombre) : 'Selecciona un proyecto'}
        actions={
          <button
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-border bg-card hover:bg-muted text-sm font-medium transition-colors text-muted-foreground disabled:opacity-50"
          >
            <ArrowClockwise size={14} weight="bold" className={loading ? 'animate-spin' : ''} />
            Actualizar
          </button>
        }
      />

      {/* Lo primero, porque es la pregunta que se hace de verdad. Lo de abajo
          —si hay una credencial guardada— solo importa cuando esto dice que
          algo no va. */}
      {veEstado && <PiezasDelSistema />}

      {integraciones.length > 0 && <>
      <h2 className="font-bold pt-2">Credenciales guardadas</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 !mt-3">
        {integraciones.map(({ service, name, desc, icon: Icon, color }) => {
          const status = loading ? 'loading' : getStatus(service);
          return (
            <div key={service} className={`bg-card border rounded-xl p-5 flex items-start gap-4 transition-colors ${status === 'ok' ? 'border-emerald-200/60 dark:border-emerald-800/30' : status === 'missing' ? 'border-amber-200/60 dark:border-amber-800/30' : 'border-border'}`}>
              <div className={`w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 ${color}`}>
                <Icon size={20} weight="duotone" />
              </div>
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{name}</p>
                  <StatusBadge status={status} />
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            </div>
          );
        })}
      </div>
      </>}

      {/* Los correos, aqui y no en una pantalla propia: esto es «estado del
          sistema» y lo primero que se pregunta cuando algo no llega es si
          salio. Antes habia que entrar a Postgres para saberlo. */}
      {veEstado && <CorreosEnviados />}

      <p className="text-xs text-muted-foreground text-center">
        Las credenciales se configuran en <strong>Configuración → APIs</strong> de cada proyecto.
        Este bloque solo dice si hay una credencial guardada — que esté puesta no significa que valga.
        Si funciona o no lo dice <strong>Cómo está ahora mismo</strong>, arriba.
      </p>
    </div>
  );
}
