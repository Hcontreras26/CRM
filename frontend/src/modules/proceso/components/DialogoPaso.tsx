import { useEffect, useState } from 'react';
import { X } from '@phosphor-icons/react';
import Field from '@/shared/components/ui/Field';
import FilaCampos from '@/shared/components/ui/FilaCampos';
import { inputClass } from '@/shared/lib/ui';
import { cn } from '@/shared/lib/utils';
import EditorDeCanales from './EditorDeCanales';
import type { Canal } from '../lib/canales';
import type { Paso } from '../api/proceso.api';
import { textoDeDiasEscritos, tieneVentanaDeDias } from '../lib/cuando';

/**
 * Crear o editar un paso.
 *
 * Tres reglas del issue que se ven aquí:
 *
 * - La `clave` solo se teclea al crear. Editando se enseña apagada y sin
 *   campo: es el nombre con el que el código encuentra el paso, y cambiarla
 *   rompería lo que apunte a ella.
 * - Los días son DÍAS DESDE QUE ENTRA EL PROSPECTO, no días de la semana.
 *   Está dicho en la pantalla, no solo en el issue, porque quien la abre no ha
 *   leído el issue.
 * - LA FRASE SALE DE LOS NÚMEROS (#87). Con días puestos, «cuándo» deja de ser
 *   un campo y pasa a ser lo que la pantalla va a leer, escrito en vivo; el
 *   hueco de teclearlo solo aparece cuando no hay días, que es el caso del
 *   seguimiento de fin de mes. Antes se podían escribir los dos y por eso un
 *   paso llegó a decir «Lunes o martes» encima de unos días que decían otra
 *   cosa.
 */

const CLAVE_VALIDA = /^[a-z0-9_]+$/;

export interface DatosPaso {
  clave: string;
  nombre: string;
  cuando: string;
  dia_desde: string;
  dia_hasta: string;
  canales: Canal[];
  es_seguimiento: boolean;
  nota: string;
}

function aFormulario(paso: Paso | null): DatosPaso {
  return {
    clave: paso?.clave ?? '',
    nombre: paso?.nombre ?? '',
    cuando: paso?.cuando ?? '',
    dia_desde: paso?.dia_desde === null || paso?.dia_desde === undefined ? '' : String(paso.dia_desde),
    dia_hasta: paso?.dia_hasta === null || paso?.dia_hasta === undefined ? '' : String(paso.dia_hasta),
    canales: paso?.canales ?? [],
    es_seguimiento: paso?.es_seguimiento ?? false,
    nota: paso?.nota ?? '',
  };
}

export default function DialogoPaso({
  abierto,
  paso,
  guardando,
  errorServidor,
  onGuardar,
  onCerrar,
}: {
  abierto: boolean;
  /** Null para crear uno nuevo. */
  paso: Paso | null;
  guardando: boolean;
  errorServidor: string | null;
  onGuardar: (datos: DatosPaso) => void;
  onCerrar: () => void;
}) {
  const esNuevo = paso === null;
  const [datos, setDatos] = useState<DatosPaso>(() => aFormulario(paso));
  const [errores, setErrores] = useState<Partial<Record<keyof DatosPaso, string>>>({});

  useEffect(() => {
    if (abierto) { setDatos(aFormulario(paso)); setErrores({}); }
  }, [abierto, paso]);

  useEffect(() => {
    if (!abierto) return;
    const alPulsar = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierto, onCerrar]);

  if (!abierto) return null;

  const set = <K extends keyof DatosPaso>(campo: K, valor: DatosPaso[K]) =>
    setDatos((d) => ({ ...d, [campo]: valor }));

  const conVentana = tieneVentanaDeDias(datos.dia_desde, datos.dia_hasta);
  const frase = textoDeDiasEscritos(datos.dia_desde, datos.dia_hasta);

  /**
   * Lo que se manda a guardar.
   *
   * CON DÍAS, `cuando` VA VACÍO, y no es cosmética: si un paso tenía una frase
   * escrita a mano y luego se le ponen días, el texto viejo se quedaría en la
   * base contradiciendo a los números — que es exactamente el «Lunes o martes»
   * del #87, esperando a que alguien lo lea. Los dos no pueden convivir.
   */
  const paraGuardar = (): DatosPaso => (conVentana ? { ...datos, cuando: '' } : datos);

  function comprobar(): boolean {
    const fallos: Partial<Record<keyof DatosPaso, string>> = {};
    if (!datos.nombre.trim()) fallos.nombre = 'Ponle un nombre: es lo que se lee en la lista.';
    if (esNuevo) {
      if (!datos.clave.trim()) fallos.clave = 'Hace falta una clave para que el código encuentre el paso.';
      else if (!CLAVE_VALIDA.test(datos.clave)) {
        fallos.clave = 'Solo minúsculas, números y guión bajo. El servidor rechaza lo demás.';
      }
    }
    const desde = datos.dia_desde === '' ? null : Number(datos.dia_desde);
    const hasta = datos.dia_hasta === '' ? null : Number(datos.dia_hasta);
    if (desde !== null && hasta !== null && hasta < desde) {
      fallos.dia_hasta = 'El día final no puede ser anterior al inicial.';
    }
    setErrores(fallos);
    return Object.keys(fallos).length === 0;
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={esNuevo ? 'Nuevo paso' : `Editar ${paso?.nombre}`}
      className="fixed inset-0 z-[70] flex items-center justify-center p-0 sm:p-4"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onCerrar} aria-hidden="true" />
      <div className="relative z-10 flex max-h-full w-full flex-col overflow-hidden rounded-none border border-border bg-card shadow-dialog sm:max-w-2xl sm:rounded-lg">
        <div className="flex items-start justify-between gap-3 border-b border-border p-tarjeta">
          <div className="min-w-0">
            <h2 className="text-seccion">{esNuevo ? 'Nuevo paso' : 'Editar paso'}</h2>
            {!esNuevo && (
              // La clave, a la vista y apagada: hace falta saberla para
              // entenderse con quien toca el codigo, pero no se cambia.
              <p className="mt-0.5 text-secundario text-muted-foreground">
                Clave <code className="rounded bg-muted px-1 py-0.5">{paso?.clave}</code> — no se cambia
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); if (comprobar()) onGuardar(paraGuardar()); }}
          className="flex-1 space-y-tarjeta overflow-y-auto p-tarjeta"
        >
          {errorServidor && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-normal text-destructive-soft-foreground">
              {errorServidor}
            </p>
          )}

          <Field label="Nombre" required htmlFor="paso-nombre" error={errores.nombre}>
            <input
              id="paso-nombre"
              value={datos.nombre}
              onChange={(e) => set('nombre', e.target.value)}
              autoFocus
              className={inputClass}
            />
          </Field>

          {esNuevo && (
            <Field
              label="Clave"
              required
              htmlFor="paso-clave"
              error={errores.clave}
              hint="Con la que el código encuentra el paso. Solo minúsculas, números y guión bajo, y no se podrá cambiar después."
            >
              <input
                id="paso-clave"
                value={datos.clave}
                onChange={(e) => set('clave', e.target.value)}
                placeholder="paso_6"
                className={cn(inputClass, 'font-mono')}
              />
            </Field>
          )}

          {/* LOS DÍAS VAN PRIMERO, y el texto a mano después.
              Estaba al revés, y el orden enseña: lo primero que se leía era el
              hueco de escribir la frase, así que se escribía —«Lunes o
              martes»— y los números quedaban de acompañamiento. Es al contrario:
              los números son el dato y la frase sale de ellos. */}
          <FilaCampos>
            <Field
              label="Día desde"
              htmlFor="paso-desde"
              hint="Días desde que entró el prospecto, no de la semana."
            >
              <input
                id="paso-desde"
                type="number"
                min={0}
                value={datos.dia_desde}
                onChange={(e) => set('dia_desde', e.target.value)}
                className={cn(inputClass, 'tabular-nums')}
              />
            </Field>
            <Field
              label="Día hasta"
              htmlFor="paso-hasta"
              error={errores.dia_hasta}
              hint="Vacío si no tiene final."
            >
              <input
                id="paso-hasta"
                type="number"
                min={0}
                value={datos.dia_hasta}
                onChange={(e) => set('dia_hasta', e.target.value)}
                className={cn(inputClass, 'tabular-nums')}
              />
            </Field>
          </FilaCampos>

          {conVentana ? (
            /* Con días puestos, la frase la escribe la pantalla y aquí solo se
               enseña. Antes este campo seguía abierto con una nota pidiendo que
               se dejara vacío — y una nota que pide no hacer algo es más débil
               que no poder hacerlo. Esto es lo que cierra el #87: «un texto que
               repite lo que dice otro campo acaba contradiciéndolo». */
            <Field
              label="Cuándo se leerá"
              hint="Lo escribe la pantalla a partir de los días. Para cambiarlo, cambia los días."
            >
              {/* NO se pinta como un campo. Con el borde y el fondo de un
                  `input` invita a escribir en algo que no se puede, y esa es
                  media confusión del #87 otra vez. Es una frase, y se lee como
                  una frase. */}
              <p aria-live="polite" className="px-1 py-1.5 text-normal font-semibold">
                {frase ?? <span className="font-normal text-muted-foreground">—</span>}
              </p>
            </Field>
          ) : (
            /* Sin días, el paso no se cuenta en días y hace falta decirlo a
               mano: el quinto es «Final de mes», que es de calendario y no de
               lo que lleva esperando la persona. */
            <Field
              label="Cuándo, dicho a mano"
              htmlFor="paso-cuando"
              hint="Solo para lo que no se cuenta en días, como «Final de mes»."
            >
              <input
                id="paso-cuando"
                value={datos.cuando}
                onChange={(e) => set('cuando', e.target.value)}
                placeholder="Final de mes"
                className={inputClass}
              />
            </Field>
          )}

          <Field
            label="Canales"
            hint="En orden: el primero es con el que se arranca; si falla, el siguiente."
          >
            <EditorDeCanales canales={datos.canales} onChange={(c) => set('canales', c)} />
          </Field>

          <Field label="Nota" htmlFor="paso-nota" hint="Lo que hay que tener en cuenta al darlo.">
            <textarea
              id="paso-nota"
              value={datos.nota}
              onChange={(e) => set('nota', e.target.value)}
              rows={3}
              className={cn(inputClass, 'h-auto py-2')}
            />
          </Field>

          <label className="flex items-start gap-2.5 px-1">
            <input
              type="checkbox"
              checked={datos.es_seguimiento}
              onChange={(e) => set('es_seguimiento', e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-2 focus:ring-ring/40"
            />
            <span className="min-w-0">
              <span className="block text-normal">Es el de seguimiento</span>
              <span className="block text-secundario text-muted-foreground">
                El de fin de mes: va sobre toda la base, no sobre la cola del día.
              </span>
            </span>
          </label>
        </form>

        <div className="flex justify-end gap-2 border-t border-border p-tarjeta">
          <button
            type="button"
            onClick={onCerrar}
            className="h-9 rounded-md border border-border bg-card px-4 text-normal font-semibold hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring/40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => { if (comprobar()) onGuardar(paraGuardar()); }}
            disabled={guardando}
            className="h-9 rounded-md bg-primary px-4 text-normal font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:ring-offset-2"
          >
            {guardando ? 'Guardando…' : esNuevo ? 'Crear paso' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}
