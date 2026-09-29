import { useState, useRef, useEffect } from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { useProjectContext } from '@/contexts/ProjectContext';
import Portal from '@/shared/components/ui/portal';
import { cn } from '@/shared/lib/utils';
import { ProjectAvatar } from './Sidebar';

/**
 * En qué marca estás, y cómo cambiarla.
 *
 * Vivía dentro de `Sidebar.jsx`, y el nombre de la marca salía **tres veces**
 * en la misma pantalla: en la cabecera del menú, aquí, y en la píldora de la
 * barra de arriba (#79, punto 2). Sale aquí para poder estar en un solo sitio
 * —la cabecera— sin arrastrar consigo las 1.300 líneas del menú.
 *
 * El comportamiento no cambia: mismo orden, mismo posicionamiento, mismo cierre
 * al pulsar fuera y con Escape. Lo único que se añade es devolver el foco al
 * botón al cerrar con Escape, que faltaba: quien navega con teclado se quedaba
 * sin punto de partida.
 *
 * Va con `Portal` porque el desplegable tiene que salirse de su contenedor: en
 * la cabecera, que es `sticky` y estrecha, si no se recorta.
 */
export default function SelectorProyecto({ compacto = false, className }) {
  const { activeProject, projects, switchProject, activeIssuer, switchIssuer } = useProjectContext();
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState(null);
  const botonRef = useRef(null);
  const listaRef = useRef(null);

  useEffect(() => {
    if (!abierto) return undefined;

    function medir() {
      const btn = botonRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const margen = 8;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const ancho = Math.max(r.width, 220);
      const altoMax = Math.min(320, vh - r.bottom - margen * 2);
      let left = r.left;
      if (left + ancho + margen > vw) left = vw - ancho - margen;
      if (left < margen) left = margen;
      // Si abajo no cabe, se abre hacia arriba.
      let top = r.bottom + 6;
      if (top + altoMax + margen > vh && r.top > altoMax) top = r.top - 6 - altoMax;
      setPos({ top, left, width: ancho, maxHeight: altoMax });
    }

    medir();

    function fuera(e) {
      if (botonRef.current?.contains(e.target)) return;
      if (listaRef.current?.contains(e.target)) return;
      setAbierto(false);
    }
    function tecla(e) {
      if (e.key !== 'Escape') return;
      setAbierto(false);
      // El foco vuelve al botón: si se queda dentro de una lista que ya no
      // existe, el siguiente tabulador empieza desde el principio de la página.
      botonRef.current?.focus();
    }

    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', tecla);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
      document.removeEventListener('mousedown', fuera);
      document.removeEventListener('keydown', tecla);
    };
  }, [abierto]);

  function elegir(id) {
    switchProject(id);
    setAbierto(false);
  }

  // Los encabezados de sociedad eran letra muerta: se leian y no se podian
  // pulsar (#120). Al elegir uno se enseña esa sociedad entera.
  function elegirSociedad(id) {
    switchIssuer(id);
    setAbierto(false);
  }

  // Cuantos campus cuelgan de cada sociedad, para poder decir «CEDIA · 6
  // campus» sin recontar en cada sitio.
  const campusPorSociedad = (projects || []).reduce((cuenta, p) => {
    const id = p.sociedad_emisora_id;
    if (id) cuenta[id] = (cuenta[id] || 0) + 1;
    return cuenta;
  }, {});

  // Lo que dice el boton. Tres estados, no dos.
  const etiquetaActual = activeIssuer
    ? activeIssuer.nombre
    : activeProject?.id === -1
      ? 'Todos los proyectos'
      : (activeProject?.nombre || 'Selecciona proyecto');

  // Para el `title` y para los lectores de pantalla, con la cuenta dentro.
  const etiquetaCompleta = activeIssuer
    ? `${activeIssuer.nombre} · ${activeIssuer.campus.length} campus`
    : etiquetaActual;

  // Agrupado por sociedad emisora —las que no tienen, al final— y dentro de
  // cada una por antigüedad. Por orden alfabético, ISEIH quedaba la quinta
  // detrás de marcas que aún no tienen ni web: lo que más se usa tiene que
  // quedar arriba, que es donde se busca sin leer.
  const ordenados = [...(projects || [])].sort((a, b) => {
    const sA = a.sociedad_nombre || 'zzz';
    const sB = b.sociedad_nombre || 'zzz';
    if (sA !== sB) return sA.localeCompare(sB, 'es');
    return (a.id || 0) - (b.id || 0);
  });

  let ultimaSociedad;

  return (
    <div className={cn('relative min-w-0', className)}>
      <button
        type="button"
        ref={botonRef}
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        aria-label={`Selector de proyecto. Ahora: ${etiquetaCompleta}`}
        title={etiquetaCompleta}
        className={cn(
          'flex items-center rounded-md border border-border bg-card text-normal font-medium',
          'outline-none transition-colors hover:bg-muted',
          'focus:border-ring focus:ring-2 focus:ring-ring/20',
          compacto ? 'h-9 w-9 justify-center' : 'min-h-9 min-w-0 gap-2 py-1 pl-1.5 pr-2',
        )}
      >
        <ProjectAvatar project={activeProject} size="sm" />
        {!compacto && (
          <>
            {/* La cuenta va DEBAJO, no al lado. En la misma linea le quitaba el
                ancho al nombre y «CEDIA Investigacion y Desarrollo» se quedaba
                en «CEDIA Investigacion y Desarroll…», que es justo lo que hay
                que poder leer. */}
            <span className="min-w-0 max-w-[12rem] flex-1 text-left leading-tight">
              <span className="block truncate">{etiquetaActual}</span>
              {activeIssuer && (
                <span className="block text-secundario font-bold uppercase tracking-wide text-info-soft-foreground">
                  {activeIssuer.campus.length} campus
                </span>
              )}
            </span>
            <CaretDown size={12} weight="bold" className="shrink-0 text-muted-foreground" />
          </>
        )}
      </button>

      {abierto && pos && (
        <Portal>
          <ul
            ref={listaRef}
            role="listbox"
            aria-label="Lista de proyectos"
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
            className="z-[60] animate-in fade-in zoom-in-95 slide-in-from-top-1 overflow-y-auto rounded-lg border border-border bg-card py-1 shadow-dialog duration-150 sidebar-scroll"
          >
            {projects?.length > 1 && (
              <li role="option" aria-selected={!activeIssuer && activeProject?.id === -1}>
                <button
                  type="button"
                  onClick={() => elegir(-1)}
                  className={cn(
                    'flex w-full items-center gap-2 border-b border-border px-2 py-1.5 text-left text-normal transition-colors hover:bg-secondary',
                    !activeIssuer && activeProject?.id === -1 && 'bg-secondary font-semibold',
                  )}
                >
                  <ProjectAvatar project={{ isAll: true }} size="sm" />
                  <span className="flex-1 truncate">Todos los proyectos</span>
                  <span className="rounded bg-info-soft px-1.5 py-0.5 text-secundario font-bold text-info-soft-foreground">
                    vista global
                  </span>
                </button>
              </li>
            )}

            {ordenados.map((p) => {
              const activo = !activeIssuer && p.id === activeProject?.id;
              const soc = p.sociedad_nombre || null;
              const cabecera = soc !== ultimaSociedad;
              ultimaSociedad = soc;
              return (
                <div key={p.id}>
                  {cabecera && (
                    soc && p.sociedad_emisora_id ? (
                      // La sociedad entera. Era un titulo muerto; ahora es la
                      // tercera opcion: sus campus sumados.
                      <li role="option" aria-selected={activeIssuer?.id === Number(p.sociedad_emisora_id)}>
                        <button
                          type="button"
                          onClick={() => elegirSociedad(Number(p.sociedad_emisora_id))}
                          className={cn(
                            'flex w-full items-center gap-2 px-2 pb-0.5 pt-2 text-left transition-colors hover:bg-secondary',
                            activeIssuer?.id === Number(p.sociedad_emisora_id) && 'bg-secondary',
                          )}
                        >
                          <span title={soc} className="min-w-0 flex-1 truncate text-tabla uppercase text-muted-foreground/60">
                            {soc}
                          </span>
                          <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-secundario font-semibold text-muted-foreground">
                            {campusPorSociedad[p.sociedad_emisora_id] || 0} campus
                          </span>
                        </button>
                      </li>
                    ) : (
                      // «Sin sociedad» no es una sociedad: no hay nada que sumar.
                      <div className="select-none px-2 pb-0.5 pt-2 text-tabla uppercase text-muted-foreground/60">
                        {soc || 'Sin sociedad'}
                      </div>
                    )
                  )}
                  <li role="option" aria-selected={activo}>
                    <button
                      type="button"
                      onClick={() => elegir(Number(p.id))}
                      className={cn(
                        'flex w-full items-center gap-2 px-2 py-1.5 text-left text-normal transition-colors hover:bg-secondary',
                        activo && 'bg-secondary font-semibold',
                      )}
                    >
                      <ProjectAvatar project={p} size="sm" />
                      <span className="flex-1 truncate">{p.nombre}</span>
                    </button>
                  </li>
                </div>
              );
            })}
          </ul>
        </Portal>
      )}
    </div>
  );
}
