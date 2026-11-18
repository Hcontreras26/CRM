import { useEffect, useState } from 'react';
import { Robot, CheckCircle, WarningCircle, Circle, ArrowRight } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { useProjectContext } from '@/contexts/ProjectContext';

/**
 * Los proyectos IA y si están conectados ya (Psicólogo IA, Nutricionista IA,
 * Tarot IA).
 *
 * La pantalla de Integraciones configura UN proyecto: el activo. Eso está bien
 * para cambiar una clave suelta, y mal para la tarea que hay ahora, que es dar
 * de alta varios seguidos. Sin esta lista hay que ir al selector del menú,
 * entrar en cada uno y mirar, y no hay forma de saber si falta alguno.
 *
 * Se limita a los proyectos IA a propósito: son los que se conectan con access
 * token y sin webhook, y son los de la tarea. Los CRM ya están conectados desde
 * hace meses y meterlos aquí convertiría una lista de tres en uno de esos
 * cuadros que nadie mira.
 *
 * Cada fila dice lo que hay que saber ANTES de darla por hecha:
 *
 *   - la sociedad emisora, porque sin ella no hay datos fiscales para la
 *     factura y el segundo escalón del corte no se puede calcular;
 *   - si hay token guardado, y con cuál —enmascarado, nunca entero—;
 *   - cómo fue la última prueba de conexión. Un token guardado y sin probar no
 *     es un proyecto conectado: es un proyecto con un texto guardado.
 */

interface Proyecto {
  id: number;
  nombre: string;
  type: string;
  sociedad_emisora_id: number | null;
  sociedad_nombre?: string | null;
}

interface EstadoProveedor {
  has_secret: boolean;
  secret_preview: string | null;
  last_test_status: 'success' | 'error' | null;
  last_test_at: string | null;
}

type Fila = Proyecto & {
  stripe: EstadoProveedor | null;
  supabase: EstadoProveedor | null;
  cargando: boolean;
};

/** Cómo se llama cada vía, para poder decirlo en la fila. */
const COMO_SE_LLAMA: Record<string, string> = { stripe: 'Stripe', supabase: 'Supabase' };

export default function ProyectosIAConectados() {
  const { activeProject, switchProject, projects: losMios } = useProjectContext() as {
    activeProject: { id?: number | null } | null;
    switchProject: (id: number) => void;
    projects: Array<{ id: number }>;
  };
  const [filas, setFilas] = useState<Fila[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await client.get<Proyecto[]>('/projects');
        const ia = (r?.data || []).filter((p) => p.type === 'ia');
        if (!vivo) return;
        setFilas(ia.map((p) => ({ ...p, stripe: null, supabase: null, cargando: true })));
        /*
          SE MIRAN LAS DOS VÍAS, no solo Stripe.

          Esta lista se escribió cuando Stripe era el único camino. Con Tarot
          conectado por Supabase, la fila decía «sin access token» y el
          recuento «0 de 3» mientras la tarjeta de abajo estaba en verde: el
          resumen contradecía a lo que tenía justo debajo, que es peor que no
          tener resumen.
        */
        const deProveedor = async (pid: number, proveedor: string) => {
          try {
            const s = await client.get<EstadoProveedor>(`/integrations/${proveedor}?projectId=${pid}`);
            return s?.data || null;
          } catch { return null; }
        };
        // Dos por proyecto, tres proyectos. Si mañana son treinta, esto se
        // nota y se cambia por un endpoint que los devuelva juntos.
        await Promise.all(ia.map(async (p) => {
          const [stripe, supabase] = await Promise.all([
            deProveedor(p.id, 'stripe'), deProveedor(p.id, 'supabase'),
          ]);
          if (!vivo) return;
          setFilas((prev) => prev.map((f) => (f.id === p.id ? { ...f, stripe, supabase, cargando: false } : f)));
        }));
      } catch {
        if (vivo) setFilas([]);
      } finally {
        if (vivo) setCargando(false);
      }
    })();
    return () => { vivo = false; };
  }, []);

  // Sin proyectos IA no hay nada que decir, y una caja vacía en una pantalla
  // que ya tiene tres bloques de ayuda estorba.
  if (cargando || filas.length === 0) return null;

  /** Conectado = alguna vía con clave Y con la prueba en verde. */
  const vias = (f: Fila) => ([['stripe', f.stripe], ['supabase', f.supabase]] as Array<[string, EstadoProveedor | null]>)
    .filter(([, e]) => e?.has_secret);
  const estaConectado = (f: Fila) => vias(f).some(([, e]) => e?.last_test_status === 'success');
  const conectados = filas.filter(estaConectado).length;

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-5 py-3.5 border-b border-border flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-info-soft/30 text-info-soft-foreground flex items-center justify-center flex-shrink-0">
          <Robot size={20} weight="duotone" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">Proyectos IA</h3>
          <p className="text-[11px] text-muted-foreground">
            Se conectan con un access token, sin webhook — por Stripe, por su Supabase, o por los dos.
            {' '}{conectados} de {filas.length} con la conexión probada.
          </p>
        </div>
      </div>

      <div className="divide-y divide-border">
        {filas.map((f) => {
          const conectadas = vias(f);
          const conToken = conectadas.length > 0;
          const probado = estaConectado(f);
          const fallo = conToken && !probado && conectadas.some(([, e]) => e?.last_test_status === 'error');
          const esElActivo = activeProject?.id === f.id;
          /*
            ¿ESTE PROYECTO ESTÁ ASIGNADO A QUIEN MIRA?

            La lista sale de `/projects`, que a un admin se los da todos. Pero
            el proyecto activo solo puede ser uno de los de SU sesión —los que
            vienen en `/auth/me`—, y `switchProject` descarta en silencio
            cualquier otro.

            Hoy los tres IA no están asignados a nadie: al entrar con Diego,
            `/auth/me` devuelve ISEIH y Psiko Aprende y nada más. Sin esto el
            botón se pulsaba y no pasaba absolutamente nada, que es la peor
            forma de enterarse. Antes de conectar ninguno hay que asignarlos en
            Ajustes → Usuarios.
          */
          const esMio = losMios.some((p) => p.id === f.id);
          return (
            <div key={f.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-[160px]">
                {f.cargando ? <Circle size={14} className="text-muted-foreground animate-pulse" />
                  : probado ? <CheckCircle size={14} weight="fill" className="text-success" />
                    : fallo ? <WarningCircle size={14} weight="fill" className="text-destructive" />
                      : <Circle size={14} className="text-muted-foreground" />}
                <span className="text-sm font-medium">{f.nombre}</span>
              </div>

              <div className="flex-1 min-w-[220px] text-[11px] text-muted-foreground space-y-0.5">
                <p>
                  {f.sociedad_emisora_id
                    ? <>Sociedad: <span className="text-foreground">{f.sociedad_nombre || `#${f.sociedad_emisora_id}`}</span></>
                    : <span className="text-warning">Sin sociedad emisora — no podrá facturar</span>}
                </p>
                <p>
                  {f.cargando ? 'Consultando…'
                    : !conToken ? <span className="text-warning">Sin access token</span>
                      : conectadas.map(([nombre, e], i) => (
                        <span key={nombre}>
                          {i > 0 && ' · '}
                          {COMO_SE_LLAMA[nombre]}{' '}
                          <code className="px-1 rounded bg-muted">{e?.secret_preview || '—'}</code>{' '}
                          {e?.last_test_status === 'success'
                            ? <span className="text-success">probado</span>
                            : e?.last_test_status === 'error'
                              ? <span className="text-destructive">la última prueba falló</span>
                              : <span className="text-warning">sin probar</span>}
                        </span>
                      ))}
                </p>
              </div>

              {esElActivo ? (
                <span className="text-[11px] text-primary font-semibold px-2">Lo estás configurando abajo</span>
              ) : !esMio ? (
                <span
                  className="text-[11px] text-warning px-2 text-right max-w-[220px]"
                  title="El proyecto activo solo puede ser uno de los asignados a tu usuario"
                >
                  No está asignado a tu usuario — asígnatelo en Ajustes → Usuarios para poder configurarlo
                </span>
              ) : (
                // Cambia el proyecto activo, que es de quien tira la tarjeta de
                // abajo. Es el mismo estado que el selector del menú, no otro.
                <button
                  type="button"
                  onClick={() => switchProject(f.id)}
                  className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border bg-card text-xs font-semibold hover:bg-muted"
                >
                  Configurar <ArrowRight size={12} weight="bold" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
