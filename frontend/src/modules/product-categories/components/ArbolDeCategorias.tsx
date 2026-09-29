import { useState } from 'react';
import { CaretDown, CaretRight } from '@phosphor-icons/react';
import { casaLaRama } from '../lib/arbol';
import type { CategoryNode } from '../api/categories.api';

// El arbol de categorias como FILTRO: se elige una rama y la lista de al lado
// se recorta a ella.
//
// Estaba dentro de `ProductsPage`, y ahi no habia forma de probarlo sin montar
// la pagina entera —con su router, sus llamadas y su proyecto activo—, asi que
// no se probaba. Sale aqui por eso y porque el ticket (#2) pedia que el
// buscador de categorias se pudiera reutilizar en los filtros del listado: un
// arbol metido en una pagina no se reutiliza, se copia.
//
// Quien filtra no es quien rellena un formulario: aqui se ve la forma del
// catalogo y se baja por el, mientras en el formulario se escribe el nombre y
// se elige. Son dos pantallas distintas a proposito. Lo que NO puede ser es que
// busquen distinto, y por eso las dos preguntan a `casaLaRama`.

function Rama({
  node,
  depth,
  selectedId,
  onSelect,
  search,
  ruta = '',
}: {
  node: CategoryNode;
  depth: number;
  selectedId: number | null;
  onSelect: (n: CategoryNode | null) => void;
  search: string;
  /** Lo que queda por encima de este nodo, para buscar por la rama entera. */
  ruta?: string;
}) {
  const [desplegado, setDesplegado] = useState(depth < 1);
  const hasChildren = node.children.length > 0;
  if (!casaLaRama(node, search, ruta)) return null;
  // Buscando se abre todo. Lo que casa suele estar en el tercer nivel y las
  // ramas nacen cerradas: sin esto se escribe, sobrevive una rama, y lo que se
  // buscaba sigue sin verse — que es lo mismo que no encontrarlo.
  const open = search.trim() ? true : desplegado;
  const rutaHija = ruta ? `${ruta} ${node.nombre}` : node.nombre;
  const isSelected = selectedId === node.id;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1.5 px-2 rounded text-[13px] cursor-pointer transition-colors ${
          isSelected ? 'bg-primary/15 text-primary font-medium' : 'hover:bg-muted/50'
        }`}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => onSelect(isSelected ? null : node)}
      >
        <button
          type="button"
          aria-label={hasChildren ? (open ? `Plegar ${node.nombre}` : `Desplegar ${node.nombre}`) : undefined}
          onClick={(e) => { e.stopPropagation(); if (hasChildren) setDesplegado((o) => !o); }}
          className="flex-shrink-0 w-4 flex items-center justify-center"
        >
          {hasChildren ? (open ? <CaretDown size={11} /> : <CaretRight size={11} />) : null}
        </button>
        <span className="truncate flex-1">{node.nombre}</span>
        {node.productos_count > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
            {node.productos_count}
          </span>
        )}
      </div>
      {hasChildren && open && (
        <div>
          {node.children.map((c) => (
            <Rama key={c.id} node={c} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} search={search} ruta={rutaHija} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function ArbolDeCategorias({
  nodos,
  selectedId,
  onSelect,
  search = '',
}: {
  nodos: CategoryNode[];
  selectedId: number | null;
  onSelect: (n: CategoryNode | null) => void;
  /** Lo escrito en el buscador de arriba. Vacio = no se esconde nada. */
  search?: string;
}) {
  return (
    <>
      {nodos.map((node) => (
        <Rama
          key={node.id}
          node={node}
          depth={0}
          selectedId={selectedId}
          onSelect={onSelect}
          search={search}
        />
      ))}
    </>
  );
}
