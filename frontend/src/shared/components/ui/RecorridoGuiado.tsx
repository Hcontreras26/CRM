import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from '@phosphor-icons/react';
import { Button } from '@/shared/components/ui/button';

/**
 * Un recorrido guiado: carteles que señalan, paso a paso, lo que la persona ya tiene
 * delante. El mismo comportamiento que el del chat de WhatsApp (modules/whatsapp/
 * components/Tour.tsx), sin sus estilos, para usarlo en cualquier pantalla. Primero, el
 * tablero del equipo (Diego, 12/10: «un tutorial guiado, para verlo y todo»).
 *
 *  · Cada paso apunta a un selector (`donde`). Si no está en pantalla —un colaborador no
 *    ve «Configurar tablero»—, se espera un momento y se salta: lo que no tiene, no se
 *    le explica.
 *  · Se marca como visto en el navegador AL ABRIRSE (es una preferencia de cada persona,
 *    no un dato del CRM). Para volver a verlo, el botón de la pantalla.
 *  · Escape, la X o pulsar fuera lo cierran.
 */
export interface PasoRecorrido {
  /** A qué se apunta (selector CSS). Sin él, el cartel sale centrado. */
  donde?: string;
  titulo: string;
  /** `{pasos}` se cambia por el número de pasos de este recorrido. */
  texto: string;
}

const visto = (clave: string) => {
  try { return localStorage.getItem(clave) === '1'; } catch { return true; }
};

/** ¿Hay que enseñarlo solo (primera vez de esta persona en este navegador)? */
export const recorridoPendiente = (clave: string) => !visto(clave);

export default function RecorridoGuiado({ pasos, clave, alCerrar }: {
  pasos: PasoRecorrido[]; clave: string; alCerrar: () => void;
}) {
  const [paso, setPaso] = useState(0);
  const [hueco, setHueco] = useState<DOMRect | null>(null);
  const cartel = useRef<HTMLDivElement | null>(null);
  const [altoCartel, setAltoCartel] = useState(0);
  const [ventana, setVentana] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

  useEffect(() => {
    try { localStorage.setItem(clave, '1'); } catch { /* navegador sin permiso */ }
  }, [clave]);

  useEffect(() => {
    const alRedimensionar = () => setVentana({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', alRedimensionar);
    return () => window.removeEventListener('resize', alRedimensionar);
  }, []);

  useEffect(() => {
    if (cartel.current) setAltoCartel(cartel.current.offsetHeight);
  }, [paso, hueco]);

  const actual = pasos[paso];
  const cerrar = useCallback(() => alCerrar(), [alCerrar]);

  const saltar = useCallback(() => {
    for (let i = paso + 1; i < pasos.length; i++) {
      const p = pasos[i];
      if (!p.donde || document.querySelector(p.donde)) { setPaso(i); return; }
    }
    cerrar();
  }, [paso, pasos, cerrar]);

  const atras = useCallback(() => {
    for (let i = paso - 1; i >= 0; i--) {
      const p = pasos[i];
      if (!p.donde || document.querySelector(p.donde)) { setPaso(i); return; }
    }
  }, [paso, pasos]);

  // Se mide cada medio segundo: el tablero carga por tandas y la ventana cambia. Si lo
  // señalado no aparece en 1,5 s, el paso se salta.
  useEffect(() => {
    if (!actual?.donde) { setHueco(null); return undefined; }
    let esperando = 0;
    let traido = false;
    const medir = () => {
      const el = document.querySelector(actual.donde!);
      if (el) {
        esperando = 0;
        if (!traido) {
          traido = true;
          if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        }
        setHueco(el.getBoundingClientRect());
        return;
      }
      setHueco(null);
      esperando += 1;
      if (esperando > 3) saltar();
    };
    medir();
    window.addEventListener('resize', medir);
    const t = setInterval(medir, 500);
    return () => { window.removeEventListener('resize', medir); clearInterval(t); };
  }, [actual, saltar]);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cerrar();
      if (e.key === 'ArrowRight') saltar();
      if (e.key === 'ArrowLeft') atras();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [cerrar, saltar, atras]);

  if (!actual) return null;
  const ultimo = paso === pasos.length - 1;

  // El cartel, pegado a lo que señala y sin salirse de la pantalla (debajo; si no cabe,
  // encima; si tampoco, arriba del todo, para que los botones se puedan pulsar siempre).
  const margen = 12;
  const anchoCartel = Math.min(340, ventana.w - margen * 2);
  const alto = altoCartel || 200;
  let izquierda = hueco ? hueco.left : ventana.w / 2 - anchoCartel / 2;
  let arriba = hueco ? hueco.bottom + margen : ventana.h / 2 - alto / 2;
  izquierda = Math.max(margen, Math.min(izquierda, ventana.w - anchoCartel - margen));
  if (arriba + alto + margen > ventana.h) {
    const encima = (hueco?.top ?? ventana.h) - alto - margen;
    arriba = encima >= margen ? encima : margen;
  }

  return (
    <div className="fixed inset-0 z-[90]" onClick={cerrar} role="presentation">
      {hueco ? (
        // El recuadro que rodea lo que se explica; su sombra oscurece todo lo demás.
        <div
          className="pointer-events-none fixed rounded-lg ring-2 ring-primary transition-all duration-200 motion-reduce:transition-none"
          style={{
            left: hueco.left - 6, top: hueco.top - 6, width: hueco.width + 12, height: hueco.height + 12,
            boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
          }}
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 bg-black/55" />
      )}

      <div
        ref={cartel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recorrido-titulo"
        className="fixed rounded-lg border border-border bg-card p-4 shadow-xl"
        style={{ left: izquierda, top: arriba, width: anchoCartel }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="recorrido-titulo" className="text-sm font-semibold">{actual.titulo}</h2>
          <button type="button" onClick={cerrar} aria-label="Cerrar el recorrido"
            className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground">
            <X size={14} />
          </button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{actual.texto.replace('{pasos}', String(pasos.length))}</p>
        <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div className="h-full rounded-full bg-primary transition-all motion-reduce:transition-none" style={{ width: `${((paso + 1) / pasos.length) * 100}%` }} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">{paso + 1} de {pasos.length}</span>
          <div className="flex gap-2">
            {/* «Atrás» guarda su sitio aunque no se pueda usar: «Siguiente» no se mueve bajo el ratón. */}
            <Button type="button" variant="ghost" size="sm" onClick={atras} disabled={paso === 0}
              style={paso === 0 ? { visibility: 'hidden' } : undefined} tabIndex={paso === 0 ? -1 : 0}>
              <ArrowLeft size={13} className="mr-1" /> Atrás
            </Button>
            {ultimo ? (
              <Button type="button" size="sm" onClick={cerrar} data-autofocus>Entendido</Button>
            ) : (
              <Button type="button" size="sm" onClick={saltar} data-autofocus>
                Siguiente <ArrowRight size={13} className="ml-1" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
