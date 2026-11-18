import { useEffect, useState } from 'react';
import { CheckCircle, WarningCircle, ArrowRight } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { useProjectContext } from '@/contexts/ProjectContext';
import { ambitoComoObjeto } from '@/shared/lib/ambitoInforme';
import { esProyectoIA } from '@/shared/lib/proyectosIA';

/**
 * Integraciones con «Todos» o una empresa arriba (#218, Diego 04/11/2026): el
 * estado de cada campus en una lista, SOLO PARA VER. Conectar o cambiar una
 * clave sigue pidiendo elegir el campus: «Entrar» lo pone arriba y la pantalla
 * enseña sus tarjetas de siempre.
 *
 * El servidor (`GET /integrations/estado`) da los campus de quien mira y, de
 * cada uno, si hay clave guardada y cómo fue la última prueba. Nunca la clave.
 */

type Proveedor = 'stripe' | 'brevo' | 'moodle' | 'supabase';

interface Conexion {
  provider: Proveedor;
  has_secret: boolean;
  last_test_status: 'success' | 'error' | null;
  last_test_at: string | null;
}

interface Campus {
  id: number;
  nombre: string;
  type: string;
  integraciones: Conexion[];
}

const NOMBRE: Record<Proveedor, string> = { stripe: 'Stripe', brevo: 'Brevo', moodle: 'Campus (Moodle)', supabase: 'Supabase' };

function fecha(d: string | null) {
  if (!d) return null;
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

/** La misma lectura que la tarjeta de cada campus (`StatusPill`). */
export function estadoDe(c: Conexion | undefined): 'sin' | 'ok' | 'error' | 'sin_probar' {
  if (!c?.has_secret) return 'sin';
  if (c.last_test_status === 'success') return 'ok';
  if (c.last_test_status === 'error') return 'error';
  return 'sin_probar';
}

function Estado({ conexion }: { conexion: Conexion | undefined }) {
  const e = estadoDe(conexion);
  const cuando = fecha(conexion?.last_test_at ?? null);
  const titulo = cuando ? `Última prueba: ${cuando}` : undefined;
  if (e === 'ok') return (
    <span title={titulo} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-success-soft text-success-soft-foreground">
      <CheckCircle size={10} weight="fill" /> Conectado
    </span>
  );
  if (e === 'error') return (
    <span title={titulo} className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-destructive-soft text-destructive-soft-foreground">
      <WarningCircle size={10} weight="fill" /> Error
    </span>
  );
  if (e === 'sin_probar') return (
    <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-info-soft text-info-soft-foreground">Guardado · sin probar</span>
  );
  return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-muted text-muted-foreground">Sin configurar</span>;
}

export default function EstadoDeLasIntegraciones() {
  const { activeIssuerId, activeProject, switchProject } = useProjectContext() as {
    activeIssuerId?: number | null;
    activeProject?: { id?: number | null } | null;
    switchProject?: (id: number) => void;
  };
  const [campus, setCampus] = useState<Campus[] | null>(null);
  const [error, setError] = useState(false);
  const proyectoId = activeProject?.id ?? null;

  useEffect(() => {
    let vivo = true;
    setCampus(null); setError(false);
    client.get<Campus[]>('/integrations/estado', { params: ambitoComoObjeto({ activeIssuerId, activeProject: { id: proyectoId } }) })
      .then((r) => { if (vivo) setCampus(r.success ? (r.data || []) : []); })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [activeIssuerId, proyectoId]);

  if (error) {
    return <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">No se pudo cargar el estado de las integraciones.</div>;
  }
  if (!campus) {
    return <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">Cargando…</div>;
  }
  if (!campus.length) {
    return <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">No hay campus en esta vista.</div>;
  }

  // Supabase solo es de los proyectos IA: la columna sale si hay alguno, y solo
  // en pruebas (#44, `shared/lib/proyectosIA`).
  const columnas: Proveedor[] = ['stripe', 'brevo', 'moodle'];
  if (campus.some((c) => esProyectoIA(c))) columnas.push('supabase');

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="font-semibold">Estado de cada campus</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Solo para ver. Para conectar o cambiar una clave, entra en el campus.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Estado de las integraciones por campus">
          <thead>
            <tr className="text-left text-xs text-muted-foreground border-b border-border">
              <th className="px-5 py-2 font-semibold">Campus</th>
              {columnas.map((p) => <th key={p} className="px-3 py-2 font-semibold">{NOMBRE[p]}</th>)}
              <th className="px-5 py-2" />
            </tr>
          </thead>
          <tbody>
            {campus.map((c) => (
              <tr key={c.id} className="border-b border-border last:border-0">
                <td className="px-5 py-2.5 font-medium">{c.nombre}</td>
                {columnas.map((p) => (
                  <td key={p} className="px-3 py-2.5">
                    {p === 'supabase' && c.type !== 'ia'
                      ? <span className="text-muted-foreground">—</span>
                      : <Estado conexion={c.integraciones.find((i) => i.provider === p)} />}
                  </td>
                ))}
                <td className="px-5 py-2.5 text-right">
                  {switchProject && (
                    <button
                      type="button"
                      onClick={() => switchProject(c.id)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      aria-label={`Entrar en ${c.nombre} para configurar sus integraciones`}
                    >
                      Entrar <ArrowRight size={12} weight="bold" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
