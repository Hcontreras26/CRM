import { useEffect, useState } from 'react';
import { CalendarCheck, WarningCircle } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { formatDate } from '@/shared/lib/format';

/**
 * DE QUÉ FECHA EN ADELANTE SE FACTURA, Y POR QUÉ.
 *
 * Se enseña donde se pega el access token, y no en otro sitio, porque el
 * momento en que este dato importa es ANTES de guardarlo: guardar la clave es
 * lo que arranca el sondeo. A los cinco minutos el CRM empieza a traer cobros
 * de Stripe por su cuenta, sin que nadie pulse nada.
 *
 * Y lo que se trae de más no es ruido. Hay 576 cobros anteriores al alta de su
 * proyecto —514 solo en Psiko Aprende, el más viejo de enero de 2025—, y ya se
 * facturaron fuera del CRM. Cada uno que alguien asocie a una venta emite una
 * factura de algo ya facturado.
 *
 * Los proyectos de hoy no los ven porque alguien puso un corte a mano en cada
 * uno. Un proyecto nuevo —los IA— no tiene ese corte: se apoya en el alta, que
 * es el tercer escalón, y por eso conviene mirarlo antes y no después.
 *
 * Se enseñan los tres escalones aunque solo mande uno: quien lo mira necesita
 * comprobar que el que manda es el que cree, no solo leer el resultado.
 */

interface Corte {
  proyecto: string;
  sociedadEmisoraId: number | null;
  corteMano: string | null;
  primeraFactura: string | null;
  altaProyecto: string | null;
  corte: string | null;
  manda: 'corte_mano' | 'primera_factura' | 'alta_proyecto' | null;
}

const COMO_SE_LLAMA: Record<string, string> = {
  corte_mano: 'el corte puesto a mano',
  primera_factura: 'la primera factura de la sociedad',
  alta_proyecto: 'el alta del proyecto en el CRM',
};

/**
 * El formateador COMPARTIDO, no uno propio.
 *
 * El primero que se escribió aquí era `new Date(d).toLocaleDateString(...)`, y
 * con una fecha sin hora —«2026-09-15»— eso se lee como medianoche UTC: en
 * cualquier zona con offset negativo pinta el día anterior. En la máquina
 * donde se probó (America/Caracas, UTC-4) el corte del 15 salía como 14.
 *
 * Un día de menos justo en la fecha que decide qué se factura. `formatDate` ya
 * lo resuelve con `toLocalDate`, y por eso existe.
 */
function dia(d: string | null): string {
  return d ? formatDate(d) : '—';
}

export default function CorteDeFacturacion({ projectId }: { projectId: number }) {
  const [c, setC] = useState<Corte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCargando(true); setFallo(false);
    client.get<Corte>(`/stripe-payments/corte?projectId=${projectId}`)
      .then((r) => { if (vivo && r.success) setC(r.data); })
      .catch(() => { if (vivo) setFallo(true); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [projectId]);

  if (cargando) return <div className="h-24 rounded-md bg-muted/40 animate-pulse" />;

  // Si no se puede saber, se dice. Callarse aquí dejaría creer que hay un
  // suelo comprobado cuando no lo hay.
  if (fallo || !c) {
    return (
      <div className="rounded-md border border-warning/30 bg-warning-soft p-3 text-xs text-warning-soft-foreground">
        <p className="font-semibold flex items-center gap-1.5">
          <WarningCircle size={13} weight="bold" /> No se ha podido consultar desde qué fecha se factura
        </p>
        <p className="mt-1">
          No guardes el token hasta saberlo: en cuanto haya clave, el sondeo empieza a traer
          cobros solo.
        </p>
      </div>
    );
  }

  const sinSuelo = !c.corte;

  return (
    <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2.5">
      <p className="text-xs font-semibold flex items-center gap-1.5">
        <CalendarCheck size={13} weight="bold" className="text-primary" />
        Antes de guardar el token
      </p>

      {sinSuelo ? (
        <p className="text-xs text-destructive">
          <strong>Este proyecto no tiene suelo de facturación.</strong> Sin él entra el histórico
          entero de la cuenta de Stripe. Ponle antes un corte, o comprueba que el proyecto tiene
          fecha de alta.
        </p>
      ) : (
        <p className="text-xs">
          Se factura <strong>desde el {dia(c.corte)}</strong>, y lo decide{' '}
          <strong>{COMO_SE_LLAMA[c.manda || ''] || 'el suelo por defecto'}</strong>. Lo anterior a
          esa fecha no aparecerá como facturable.
        </p>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
        {([
          ['Corte puesto a mano', c.corteMano, 'corte_mano'],
          ['Primera factura de la sociedad', c.primeraFactura, 'primera_factura'],
          ['Alta del proyecto en el CRM', c.altaProyecto, 'alta_proyecto'],
        ] as Array<[string, string | null, string]>).map(([etiqueta, valor, clave]) => (
          <div key={clave} className="contents">
            <dt className={`text-muted-foreground ${c.manda === clave ? 'font-semibold text-foreground' : ''}`}>
              {etiqueta}
            </dt>
            <dd className={`tabular-nums ${c.manda === clave ? 'font-semibold' : 'text-muted-foreground'}`}>
              {dia(valor)}
              {c.manda === clave && <span className="ml-1.5 text-[10px] text-primary">← manda</span>}
            </dd>
          </div>
        ))}
      </dl>

      {c.sociedadEmisoraId == null && (
        // Sin sociedad emisora el segundo escalón no existe, y además no hay de
        // dónde sacar los datos fiscales de la factura. Se dice aquí porque es
        // el momento de arreglarlo, no cuando falle la primera factura.
        <p className="text-[11px] text-warning">
          El proyecto no tiene <strong>sociedad emisora</strong>. Sin ella no hay datos fiscales
          para facturar, y el segundo escalón del corte no se puede calcular.
        </p>
      )}

      <p className="text-[11px] text-muted-foreground border-t border-border/60 pt-2">
        Guardar el token <strong>arranca la sincronización</strong>: cada cinco minutos el CRM
        pregunta a Stripe por los cobros nuevos. No hace falta pulsar nada, y no se puede
        «deshacer» trayendo de menos — lo que entra, entra.
      </p>
    </div>
  );
}
