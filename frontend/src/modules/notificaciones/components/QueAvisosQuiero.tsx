import { useEffect, useState } from 'react';
import { BellSimple, BellSlash, Warning, FloppyDisk } from '@phosphor-icons/react';
import { toast } from '@/shared/hooks/useToast';
import {
  leerPreferencias, guardarPreferencias, type Preferencias, type TipoDeAviso,
} from '../api/avisos.api';

/**
 * Apagar avisos por tipo (#111).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTO SUSTITUYE A LO QUE HABIA
 *
 * Diego, el 07/09: «que se puedan apagar por tipo, por persona. Hoy o los
 * recibes todos o ninguno».
 *
 * Había una pantalla de preferencias con siete interruptores. No apagaba nada,
 * por dos motivos a la vez:
 *
 *   1. guardaba en `localStorage`, o sea en ESE navegador — cambiabas de
 *      ordenador y volvías a recibirlo todo;
 *   2. y los tipos que listaba no existen. Decía `lead_assigned`,
 *      `reminder_due`, `conversion_won`; el backend emite `lead_asignado`,
 *      `lead_reminder`, `venta_automatica`. Ningún interruptor casaba con
 *      ningún aviso real.
 *
 * O sea que apagabas, se veía apagado, y seguías recibiéndolo. Eso es peor que
 * no tener la pantalla: quien la usa cree que ya está resuelto.
 *
 * Ahora los tipos los manda el backend —de `tipos.js`, que es de donde salen
 * los avisos— así que no pueden desincronizarse. Y se guardan por usuario.
 * ─────────────────────────────────────────────────────────────────────────────
 */

function Interruptor({
  tipo, apagado, alCambiar, deshabilitado,
}: { tipo: TipoDeAviso; apagado: boolean; alCambiar: () => void; deshabilitado: boolean }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{tipo.etiqueta}</span>
          <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${
            tipo.clase === 'accion'
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground'
          }`}>
            {tipo.clase === 'accion' ? 'Hacer' : 'Saber'}
          </span>
        </div>
        {tipo.descripcion && <p className="text-xs text-muted-foreground mt-0.5">{tipo.descripcion}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={!apagado}
        aria-label={`${apagado ? 'Encender' : 'Apagar'} ${tipo.etiqueta}`}
        disabled={deshabilitado}
        onClick={alCambiar}
        className={`mt-0.5 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-semibold flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          apagado
            ? 'border-border bg-muted text-muted-foreground'
            : 'border-primary/30 bg-primary/10 text-primary'
        }`}
      >
        {apagado ? <BellSlash size={13} weight="bold" /> : <BellSimple size={13} weight="bold" />}
        {apagado ? 'Apagado' : 'Encendido'}
      </button>
    </li>
  );
}

export default function QueAvisosQuiero() {
  const [prefs, setPrefs] = useState<Preferencias | null>(null);
  const [apagados, setApagados] = useState<string[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    leerPreferencias().then((p) => {
      if (!p) return;
      setPrefs(p);
      setApagados(p.apagados);
    });
  }, []);

  if (!prefs) {
    return (
      <section className="bg-card border border-border rounded-xl p-6 text-sm text-muted-foreground">
        Cargando preferencias…
      </section>
    );
  }

  const sucio = apagados.length !== prefs.apagados.length
    || apagados.some((t) => !prefs.apagados.includes(t));

  function alternar(tipo: string) {
    setApagados((prev) => (prev.includes(tipo) ? prev.filter((t) => t !== tipo) : [...prev, tipo]));
  }

  async function guardar() {
    setGuardando(true);
    const r = await guardarPreferencias(apagados);
    setGuardando(false);
    if (r.ok) {
      setPrefs({ ...prefs!, apagados });
      toast({ title: 'Guardado', description: 'A partir de ahora la campana respeta esto.' });
    } else {
      // El servidor dice por qué. Lo importante es que NO se quede como si
      // hubiera guardado.
      toast({ title: 'No se ha guardado', description: r.error, variant: 'destructive' });
    }
  }

  const hacer = prefs.tipos.filter((t) => t.clase === 'accion');
  const saber = prefs.tipos.filter((t) => t.clase !== 'accion');

  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden">
      <header className="flex items-center justify-between gap-3 px-4 h-12 border-b border-border">
        <h3 className="text-sm font-bold">Qué avisos quiero</h3>
        {sucio && (
          <button
            onClick={guardar}
            disabled={guardando || !prefs.guardable}
            className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary/90 disabled:opacity-50"
          >
            <FloppyDisk size={13} weight="bold" /> {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        )}
      </header>

      {!prefs.guardable && (
        // Se dice y se deshabilita. Dejar los interruptores vivos sabiendo que
        // no se van a guardar es exactamente el fallo que tenia la version
        // anterior.
        <p className="flex items-start gap-2 px-4 py-3 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-700 dark:text-amber-400">
          <Warning size={14} weight="fill" className="flex-shrink-0 mt-0.5" />
          <span>{prefs.aviso}</span>
        </p>
      )}

      <div className="divide-y divide-border">
        <div>
          <h4 className="px-4 h-9 flex items-center text-xs font-bold uppercase tracking-wider text-muted-foreground bg-muted/30">
            Para hacer
          </h4>
          <ul className="divide-y divide-border">
            {hacer.map((t) => (
              <Interruptor
                key={t.tipo} tipo={t} apagado={apagados.includes(t.tipo)}
                alCambiar={() => alternar(t.tipo)} deshabilitado={!prefs.guardable}
              />
            ))}
          </ul>
        </div>
        <div>
          <h4 className="px-4 h-9 flex items-center text-xs font-bold uppercase tracking-wider text-muted-foreground bg-muted/30">
            Para saber
          </h4>
          <ul className="divide-y divide-border">
            {saber.map((t) => (
              <Interruptor
                key={t.tipo} tipo={t} apagado={apagados.includes(t.tipo)}
                alCambiar={() => alternar(t.tipo)} deshabilitado={!prefs.guardable}
              />
            ))}
          </ul>
        </div>
      </div>

      <p className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
        Apagar un aviso no lo borra: deja de enseñarse, y al encenderlo vuelve a estar con su fecha.
      </p>
    </section>
  );
}
