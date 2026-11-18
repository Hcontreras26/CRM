import { useEffect, useState } from 'react';
import { ArrowRight } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { useProjectContext } from '@/contexts/ProjectContext';
import ArbolDeCategorias from './ArbolDeCategorias';
import type { CategoryNode } from '../api/categories.api';

/**
 * El Árbol de categorías con «Todos» o una empresa (#218, Diego 04/11/2026):
 * el de cada campus, uno debajo de otro, SOLO PARA VER. Cada campus tiene su
 * árbol —no se pueden mezclar—; crear, cambiar o sincronizar categorías sigue
 * siendo de un campus, y «Entrar» lo pone arriba.
 */

interface Campus { id: number; nombre: string; arbol: CategoryNode[] }

const cuenta = (nodos: CategoryNode[]): number =>
  nodos.reduce((n, c) => n + 1 + cuenta(c.children), 0);

export default function ArbolesDeLosCampus({ ambito }: { ambito: Record<string, string | number> | null }) {
  const { switchProject } = useProjectContext() as { switchProject?: (id: number) => void };
  const [campus, setCampus] = useState<Campus[] | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let vivo = true;
    setCampus(null);
    client.get<Campus[]>('/product-categories/ambito', { params: ambito || {} })
      .then((r) => { if (vivo) setCampus(r.success ? (r.data || []) : []); })
      .catch(() => { if (vivo) setCampus([]); });
    return () => { vivo = false; };
  }, [ambito]);

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Buscar categoría en todos los campus…"
        aria-label="Buscar categoría"
        className="w-full h-9 px-3 rounded-md border bg-card text-sm focus:outline-none focus:border-primary"
      />
      {!campus && <div className="text-sm text-muted-foreground">Cargando…</div>}
      {campus && !campus.length && <div className="text-sm text-muted-foreground">No hay campus en esta vista.</div>}
      {campus?.map((c) => (
        <section key={c.id} aria-label={`Categorías de ${c.nombre}`} className="border rounded-lg bg-card">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b">
            <h3 className="font-semibold flex-1">{c.nombre}</h3>
            <span className="text-xs text-muted-foreground">{cuenta(c.arbol)} categorías</span>
            {switchProject && (
              <button
                type="button"
                onClick={() => switchProject(c.id)}
                aria-label={`Entrar en ${c.nombre} para cambiar sus categorías`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                Entrar <ArrowRight size={12} weight="bold" />
              </button>
            )}
          </div>
          <div className="p-1">
            {c.arbol.length
              ? <ArbolDeCategorias nodos={c.arbol} selectedId={null} onSelect={() => {}} search={search} />
              : <p className="text-xs text-muted-foreground px-3 py-2">Sin categorías.</p>}
          </div>
        </section>
      ))}
    </div>
  );
}
