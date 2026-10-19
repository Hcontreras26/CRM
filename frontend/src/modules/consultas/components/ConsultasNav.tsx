import { ChatCircleText, UserCircleMinus, Gauge, UsersThree, ChartBar } from '@phosphor-icons/react';
import SubNav from '@/shared/components/ui/SubNav';
import { useAuth } from '@/contexts/AuthContext';
import { tieneRol } from '@/shared/lib/roles';

/*
  Las pestañas de Consultas (#189): la bandeja, los alumnos sin mensajes, la
  carga de trabajo (del tutor), el panel de tutores (de administración) y las
  métricas.
*/

export function useQuienSoy() {
  const { user } = useAuth() as { user: { role?: string; roles_extra?: string[] } | null };
  return {
    esTutor: tieneRol(user as never, 'tutor'),
    esAdmin: tieneRol(user as never, 'admin', 'superadmin', 'soporte'),
  };
}

export default function ConsultasNav() {
  const { esTutor, esAdmin } = useQuienSoy();
  const tabs = [
    { label: 'Consultas', to: '/consultas', icon: ChatCircleText },
    { label: 'Alumnos sin mensajes', to: '/consultas/alumnos', icon: UserCircleMinus },
    ...(esTutor ? [{ label: 'Mi carga', to: '/consultas/carga', icon: Gauge }] : []),
    ...(esAdmin ? [{ label: 'Tutores', to: '/consultas/tutores', icon: UsersThree }] : []),
    { label: 'Métricas', to: '/consultas/metricas', icon: ChartBar },
  ];
  return <SubNav tabs={tabs} sectionLabel="Consultas" sectionIcon={ChatCircleText} />;
}

/** «Mías» o «De todos», para quien es tutor y administración a la vez. */
export function VistaMiasTodas({ vista, onChange, textoMias }: { vista: 'mias' | 'todas'; onChange: (v: 'mias' | 'todas') => void; textoMias: string }) {
  return (
    <div role="tablist" aria-label="De quién" className="inline-flex rounded-md border border-border bg-muted p-0.5">
      {(['mias', 'todas'] as const).map((v) => (
        <button key={v} type="button" role="tab" aria-selected={vista === v} onClick={() => onChange(v)}
          className={`h-8 px-3 rounded text-sm font-semibold ${vista === v ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>
          {v === 'mias' ? textoMias : 'De todos'}
        </button>
      ))}
    </div>
  );
}

export function mensajeDeError(e: unknown) {
  const err = e as { data?: { error?: string }; message?: string };
  return err?.data?.error || err?.message;
}

export const fechaCorta = (s: string | null | undefined) => (s ? new Date(s).toLocaleDateString('es-ES') : '—');
