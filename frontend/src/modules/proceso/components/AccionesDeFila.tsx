// Preparar el mensaje de alguien sin abrir la ventana ni salir del CRM.
//
// Diego, 23/09: «el seguimiento del mes debe ser más interactivo». Lo que había
// obligaba a abrir el panel para cada persona: cuatro clics por prospecto y
// cuatrocientos prospectos en la lista.
//
// Diego, 24/09, viendo lo que salió de eso: «estos botones no deben redirigir a
// nada [...] el de WhatsApp sería marcar como una plantilla, pero generalmente
// esta sección es para enviar un mensaje por Wasapi».
//
// TENÍA RAZÓN, Y EL FALLO ERA PEOR DE LO QUE PARECÍA. Los dos botones abrían
// wa.me y mailto: en una pestaña nueva Y ADEMÁS apuntaban el contacto. O sea
// que un clic te sacaba del CRM y daba por contactada a una persona a la que
// nadie había escrito todavía: si el chat no se llegaba a mandar —y con un
// enlace que abre una pestaña en blanco, pasa— quedaba un contacto falso y la
// persona desaparecía del repaso hasta el mes siguiente.
//
// LO QUE HACE AHORA. Copia el mensaje de ese paso, y ya está. No abre nada, no
// apunta contacto y la fila se queda donde está. Es la regla que esa misma
// pantalla ya dice en su pie: «copiar el mensaje no cuenta: copiar no es
// escribirle». El envío de verdad va por Wasapi, con la descarga de arriba.
//
// Deja una NOTA en su historial, que no es lo mismo que un contacto: sirve para
// saber que alguien preparó el mensaje, sin que cuente como haber hablado. Es
// como se comporta ya el copiar de la cola del día.
//
// EL BOTÓN DEL CORREO SE FUE. Uno a uno no es lo de esta pantalla, y el correo
// se sigue pudiendo escribir desde la ficha de la persona, que es donde está el
// redactor con sus plantillas.
//
// EL TEXTO SOLO SE COPIA SI SALE ENTERO. Si la plantilla de ese paso se puede
// rellenar con lo que el CRM sabe, se copia lista para pegar. Si le falta algún
// dato —el importe y el plan de pagos no los lleva el CRM, y siguen yendo
// [entre corchetes]— el botón se queda apagado y lo dice: pegar un mensaje que
// pone «[importe]» es peor que no mandar nada.

import { useMemo, useState } from 'react';
import { Copy, Check, CircleNotch } from '@phosphor-icons/react';
import { rellenar, huecosSinRellenar, type DatosParaRellenar } from '@/modules/whatsapp/lib/plantilla';
import type { PlantillaWhatsapp } from '@/modules/whatsapp/api/whatsapp.api';

/** Lo que hace falta de la fila. Sirve igual para la cola y para el repaso. */
export interface FilaAtendible {
  lead_id: number;
  lead_nombre: string | null;
  lead_email?: string | null;
  lead_telefono?: string | null;
  clave: string;
  producto: string | null;
  fecha_inicio_texto?: string | null;
  fecha_cierre_convocatoria?: string | null;
  proyecto: string | null;
}

export default function AccionesDeFila({
  fila,
  plantillas,
  onCopiado,
}: {
  fila: FilaAtendible;
  /** Todas las del ámbito; aquí se busca la del paso de esta fila. */
  plantillas: PlantillaWhatsapp[];
  /**
   * Se ha copiado el mensaje de esta persona.
   *
   * NO es haber contactado: quien llama deja una nota y NO la saca de la lista.
   */
  onCopiado?: () => Promise<void> | void;
}) {
  const [copiando, setCopiando] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const datos: DatosParaRellenar = useMemo(() => ({
    nombre: fila.lead_nombre,
    email: fila.lead_email,
    telefono: fila.lead_telefono,
    producto: fila.producto,
    inicio: fila.fecha_inicio_texto,
    cierre: fila.fecha_cierre_convocatoria,
  }), [fila]);

  /**
   * El mensaje de este paso, solo si sale entero.
   *
   * `huecosSinRellenar` es la misma comprobación que hace el panel antes de
   * dejar copiar: así el botón rápido y el panel no pueden discrepar sobre si
   * un mensaje está listo.
   */
  const suya = useMemo(
    () => plantillas.find((p) => (p as { paso_clave?: string | null }).paso_clave === fila.clave),
    [plantillas, fila.clave]);

  const huecos = useMemo(
    () => (suya ? huecosSinRellenar(suya.body, datos, fila.proyecto) : []),
    [suya, datos, fila.proyecto]);

  const textoListo = useMemo(
    () => (suya && huecos.length === 0 ? rellenar(suya.body, datos, fila.proyecto) : null),
    [suya, huecos, datos, fila.proyecto]);

  async function copiar(e: React.MouseEvent) {
    e.stopPropagation();
    if (!textoListo || copiando) return;
    setCopiando(true);
    try {
      await navigator.clipboard.writeText(textoListo);
      setCopiado(true);
      // Vuelve a su sitio: la fila NO desaparece, así que el botón tiene que
      // poder usarse otra vez —para otra persona se copia el suyo, y para la
      // misma a veces se copia dos veces.
      setTimeout(() => setCopiado(false), 2500);
      await onCopiado?.();
    } finally {
      setCopiando(false);
    }
  }

  if (copiado) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-success">
        <Check size={13} weight="bold" /> copiado
      </span>
    );
  }

  const razon = !suya
    ? 'Este paso no tiene plantilla en este proyecto'
    : huecos.length > 0
      ? `Le faltan datos que el CRM no tiene: ${huecos.join(', ')}`
      : 'Copiar el mensaje de este paso, listo para pegar';

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        disabled={!textoListo || copiando}
        title={razon}
        aria-label={`Copiar el mensaje para ${fila.lead_nombre || 'este prospecto'}`}
        className={'inline-flex h-7 w-7 items-center justify-center rounded-md border border-border '
          + 'text-muted-foreground transition-colors hover:bg-muted hover:text-foreground '
          + 'focus:outline-none focus:ring-2 focus:ring-ring/40 '
          + 'disabled:cursor-not-allowed disabled:opacity-40'}
        onClick={copiar}
      >
        {copiando
          ? <CircleNotch size={14} className="animate-spin" />
          : <Copy size={14} />}
      </button>
    </div>
  );
}
