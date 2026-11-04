import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle, WarningCircle } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { useProjectContext } from '@/contexts/ProjectContext';

/**
 * WooCommerce con «Todos» o una empresa (#218, Diego 04/11/2026): la tienda de
 * cada campus en una lista, SOLO PARA VER. Conectar la tienda, cambiar las
 * claves o importar sigue siendo de un campus: «Entrar» lo pone arriba.
 *
 * El servidor (`GET /woocommerce/estado`) da los campus de quien mira, si hay
 * tienda conectada y cómo fue la última importación. Nunca las claves.
 */

interface Campus {
  id: number;
  nombre: string;
  conectado: boolean;
  activo: boolean;
  ultima_estado: 'running' | 'success' | 'error' | null;
  ultima_inicio: string | null;
  ultima_fin: string | null;
  total_fetched: number | null;
  total_created: number | null;
  total_updated: number | null;
}

function fecha(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function Tienda({ c }: { c: Campus }) {
  if (!c.conectado) return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-muted text-muted-foreground">Sin conectar</span>;
  if (!c.activo) return <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-warning-soft text-warning-soft-foreground">Conectada · pausada</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-success-soft text-success-soft-foreground">
      <CheckCircle size={10} weight="fill" /> Conectada
    </span>
  );
}

function Ultima({ c }: { c: Campus }) {
  if (!c.ultima_estado) return <span className="text-muted-foreground">Nunca</span>;
  if (c.ultima_estado === 'running') return <span>En curso desde {fecha(c.ultima_inicio)}</span>;
  if (c.ultima_estado === 'error') return (
    <span className="inline-flex items-center gap-1 text-destructive">
      <WarningCircle size={12} weight="fill" /> Error · {fecha(c.ultima_fin || c.ultima_inicio)}
    </span>
  );
  return (
    <span>
      {fecha(c.ultima_fin)} · {c.total_fetched ?? 0} productos
      <span className="text-muted-foreground"> ({c.total_created ?? 0} nuevos, {c.total_updated ?? 0} actualizados)</span>
    </span>
  );
}

export default function EstadoDeWooCommerce({ ambito }: { ambito: Record<string, string | number> | null }) {
  const { switchProject } = useProjectContext() as { switchProject?: (id: number) => void };
  const [campus, setCampus] = useState<Campus[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCampus(null); setError(false);
    client.get<Campus[]>('/woocommerce/estado', { params: ambito || {} })
      .then((r) => { if (vivo) setCampus(r.success ? (r.data || []) : []); })
      .catch(() => { if (vivo) setError(true); });
    return () => { vivo = false; };
  }, [ambito]);

  if (error) return <div className="bg-card border border-border rounded-lg p-6 text-sm text-destructive">No se pudo cargar el estado de WooCommerce.</div>;
  if (!campus) return <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">Cargando…</div>;
  if (!campus.length) return <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground">No hay campus en esta vista.</div>;

  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-sm" aria-label="WooCommerce de cada campus">
        <thead>
          <tr className="text-left text-xs text-muted-foreground border-b border-border">
            <th className="px-5 py-2 font-semibold">Campus</th>
            <th className="px-3 py-2 font-semibold">Tienda</th>
            <th className="px-3 py-2 font-semibold">Última importación</th>
            <th className="px-5 py-2" />
          </tr>
        </thead>
        <tbody>
          {campus.map((c) => (
            <tr key={c.id} className="border-b border-border last:border-0">
              <td className="px-5 py-2.5 font-medium">{c.nombre}</td>
              <td className="px-3 py-2.5"><Tienda c={c} /></td>
              <td className="px-3 py-2.5 text-xs"><Ultima c={c} /></td>
              <td className="px-5 py-2.5 text-right">
                {switchProject && (
                  <button
                    type="button"
                    onClick={() => switchProject(c.id)}
                    aria-label={`Entrar en ${c.nombre} para configurar WooCommerce`}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
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
  );
}
