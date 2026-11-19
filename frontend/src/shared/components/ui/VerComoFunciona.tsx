import { useEffect, useMemo, useState } from 'react';
import { Compass } from '@phosphor-icons/react';
import { useAuth } from '@/contexts/AuthContext';
import usePermission from '@/shared/hooks/usePermission';
import RecorridoGuiado from '@/shared/components/ui/RecorridoGuiado';
import { tienePermiso } from '@/shared/lib/recorridosCobros';
import {
  APAGADA, RECORRIDOS_PRUEBA, claveRecorridoPrueba, pasosDePrueba, type IdRecorridoPrueba,
} from '@/shared/lib/recorridosDePrueba';
import { estaEncendido } from '@/shared/lib/interruptores';

/**
 * «Ver cómo funciona»: el recorrido guiado para probar una función nueva de
 * staging (CRM#856). Como `VerRecorrido` (#908), salvo en lo que pide la #856:
 *
 *  · NUNCA SE ABRE SOLO: solo al pulsar el botón.
 *  · Si la función tiene interruptor, al pulsar se pregunta al servidor. Apagada,
 *    no se abre nada y el botón dice «Esta función está apagada: la enciende Diego».
 *  · Sin el permiso del recorrido, ni botón ni recorrido; los pasos de botones que
 *    esa persona no tiene se quitan antes de empezar.
 *  · Si con el recorrido puesto se abre otra ventana (una ficha, un diálogo), el
 *    recorrido se cierra: nunca encima de otra cosa.
 */

const OTRA_VENTANA = '[role="dialog"]:not([aria-labelledby="recorrido-titulo"]), [role="alertdialog"]';
const hayOtraVentana = () => typeof document !== 'undefined' && !!document.querySelector(OTRA_VENTANA);

/** Quién mira. Fuera de la sesión (una prueba que monta solo un componente), nadie. */
function useQuienMira(): { id?: number | string } | null {
  try {
    return (useAuth() as { user: { id?: number | string } | null }).user;
  } catch {
    return null;
  }
}

export default function VerComoFunciona({ id, texto, compacto = false }: {
  id: IdRecorridoPrueba;
  /** Con varios en la misma pantalla, qué dice cada botón (de serie, «Ver cómo funciona»). */
  texto?: string;
  /** Dentro de una tarjeta: el botón, pequeño. */
  compacto?: boolean;
}) {
  const user = useQuienMira();
  const { can } = usePermission();
  const recorrido = RECORRIDOS_PRUEBA[id];
  const permitido = !!user && tienePermiso(recorrido.permiso, can);
  // `can` cambia en cada render; los pasos, solo si cambia lo que se puede.
  const firma = recorrido.pasos.map((p) => (tienePermiso(p.permiso, can) ? '1' : '0')).join('');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pasos = useMemo(() => pasosDePrueba(recorrido, can), [recorrido, firma]);
  const [abierto, setAbierto] = useState(false);
  const [mirando, setMirando] = useState(false);
  const [apagada, setApagada] = useState(false);

  // Con el recorrido puesto, si se abre otra ventana encima, se cierra.
  useEffect(() => {
    if (!abierto) return undefined;
    const t = setInterval(() => { if (hayOtraVentana()) setAbierto(false); }, 400);
    return () => clearInterval(t);
  }, [abierto]);

  if (!permitido || pasos.length === 0) return null;

  async function abrir() {
    if (recorrido.interruptor) {
      setMirando(true);
      const encendida = await estaEncendido(recorrido.interruptor);
      setMirando(false);
      setApagada(!encendida);
      if (!encendida) return;
    }
    setAbierto(true);
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={abrir}
        disabled={mirando}
        title={`Un recorrido paso a paso para probar: ${recorrido.titulo.toLowerCase()}`}
        aria-label={`Ver cómo funciona: ${recorrido.titulo}`}
        data-ver-como-funciona={id}
        className={compacto
          ? 'inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-border bg-card text-xs font-semibold hover:bg-muted disabled:opacity-60'
          : 'inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted disabled:opacity-60'}
      >
        <Compass size={compacto ? 13 : 14} weight="bold" aria-hidden="true" /> {texto || 'Ver cómo funciona'}
      </button>
      {apagada && (
        <span role="status" className="text-xs text-muted-foreground">{APAGADA}</span>
      )}
      {abierto && (
        <RecorridoGuiado pasos={pasos} clave={claveRecorridoPrueba(id, user?.id)} alCerrar={() => setAbierto(false)} />
      )}
    </span>
  );
}
