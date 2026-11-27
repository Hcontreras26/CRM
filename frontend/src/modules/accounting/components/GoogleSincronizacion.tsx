import { useEffect, useMemo, useState } from 'react';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';
import { ArrowsClockwise, FloppyDisk, ArrowCounterClockwise } from '@phosphor-icons/react';

/**
 * LA SINCRONIZACIÓN DEL CAMPUS, DESDE SU TARJETA (CRM#1210, norma del 27/11).
 *
 * Antes solo arrancaba con GA4_SYNC_ACTIVO / GSC_SYNC_ACTIVO en el `.env` del
 * servidor, para todos los campus a la vez. Aquí, por campus:
 *   · «Sincronizar este campus» (la automática, cada 6 h);
 *   · «Sincronizar ahora» (una vuelta ya, esté encendida o no);
 *   · la próxima vuelta y la última, con su resultado;
 *   · y en Search Console, los umbrales del aviso de caída de los lunes.
 *
 * Siempre dice de dónde sale lo que se está usando: esta pantalla, la variable
 * del servidor (reserva mientras convivan) o lo de serie. Cambiar, solo con
 * `integrations.google`: sin él se ve el estado, sin interruptores.
 */

export type Origen = 'pantalla' | 'servidor' | 'serie';

export interface Automatica {
  activa: boolean;
  origen: Origen;
  variable: string;
  cambiada_por: string | null;
  cambiada_at: string | null;
  proxima_vuelta: string | null;
  cada_horas: number;
}

export interface Umbrales { clics: number; impresiones: number; minClics: number; minImpresiones: number }
export interface UmbralesAviso {
  valores: Umbrales;
  origen: Record<keyof Umbrales, Origen>;
  de_serie: Umbrales;
  cambiado_por: string | null;
  cambiado_at: string | null;
}

interface Props<E> {
  servicio: 'ga4' | 'gsc';
  projectId: number;
  nombre: string;
  automatica: Automatica | null | undefined;
  ultima: { at: string | null; estado: string | null; error: string | null } | null;
  umbrales?: UmbralesAviso | null;
  puede: boolean;
  /** El estado nuevo de la tarjeta, tal cual lo devuelve el servidor. */
  alCambiar: (estado: E) => void;
}

function fecha(d: string | null | undefined): string {
  if (!d) return 'Nunca';
  return new Date(d).toLocaleString('es-ES', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const mensajeDe = (e: unknown) => {
  const err = e as { data?: { error?: string }; message?: string };
  return err?.data?.error || err?.message || 'Error desconocido';
};

/** De dónde sale el interruptor, en una frase. */
function deDonde(a: Automatica): string {
  if (a.origen === 'pantalla') {
    return `${a.activa ? 'Encendida' : 'Apagada'} aquí${a.cambiada_por ? ` por ${a.cambiada_por}` : ''}${a.cambiada_at ? ` el ${fecha(a.cambiada_at)}` : ''}.`;
  }
  if (a.origen === 'servidor') return `Encendida por la variable ${a.variable} del servidor (nadie la ha tocado aquí).`;
  return 'Apagada de serie: nadie la ha encendido.';
}

const ORIGEN_UMBRAL: Record<Origen, string> = { pantalla: 'puesto aquí', servidor: 'del servidor', serie: 'de serie' };

const CAMPOS: Array<{ k: keyof Umbrales; etiqueta: string; unidad: string; max: number; frase: string }> = [
  { k: 'clics', etiqueta: 'Caída de clics', unidad: '%', max: 100,
    frase: 'Avisa si los clics de la semana caen más de este % frente a la semana anterior. 0 = no avisar por clics.' },
  { k: 'impresiones', etiqueta: 'Caída de impresiones', unidad: '%', max: 100,
    frase: 'Lo mismo con las veces que la web sale en Google. 0 = no avisar por impresiones.' },
  { k: 'minClics', etiqueta: 'Mínimo de clics', unidad: 'clics', max: 10000000,
    frase: 'Solo avisa por clics si la semana anterior tuvo al menos estos: de 5 a 3 es «−40 %» y no es nada.' },
  { k: 'minImpresiones', etiqueta: 'Mínimo de impresiones', unidad: 'impr.', max: 100000000,
    frase: 'Igual, con las impresiones de la semana anterior.' },
];

/** El error de un campo, o null. Lo mismo que comprueba el servidor (Zod). */
export function errorDeUmbral(texto: string, max: number): string | null {
  const t = texto.trim();
  if (t === '') return 'Falta el valor';
  if (!/^\d+$/.test(t)) return /^-/.test(t) ? 'No puede ser negativo' : 'Solo números enteros';
  if (Number(t) > max) return `Como mucho ${max.toLocaleString('es-ES')}`;
  return null;
}

const aTexto = (u: Umbrales) => Object.fromEntries(CAMPOS.map((c) => [c.k, String(u[c.k])])) as Record<keyof Umbrales, string>;

export default function GoogleSincronizacion<E>({
  servicio, projectId, nombre, automatica, ultima, umbrales, puede, alCambiar,
}: Props<E>) {
  const [cambiando, setCambiando] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; mensaje: string } | null>(null);
  const [texto, setTexto] = useState<Record<keyof Umbrales, string> | null>(umbrales ? aTexto(umbrales.valores) : null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { setTexto(umbrales ? aTexto(umbrales.valores) : null); }, [umbrales]);
  useEffect(() => { setResultado(null); }, [projectId]);

  const errores = useMemo(() => (texto
    ? Object.fromEntries(CAMPOS.map((c) => [c.k, errorDeUmbral(texto[c.k], c.max)])) as Record<keyof Umbrales, string | null>
    : null), [texto]);
  const hayErrores = !!errores && Object.values(errores).some(Boolean);
  const cambiaUmbral = !!texto && !!umbrales && CAMPOS.some((c) => texto[c.k].trim() !== String(umbrales.valores[c.k]));

  async function ponerAutomatica(activo: boolean | null) {
    setCambiando(true);
    try {
      const res = await client.put<E>(`/integrations/google/${servicio}/sincronizacion`, { projectId, activo });
      if (res.data) alCambiar(res.data);
      toast({
        title: activo === null ? `${nombre}: como diga el servidor` : `${nombre}: sincronización ${activo ? 'encendida' : 'apagada'}`,
        description: activo ? 'Entra en la próxima vuelta. Si no quieres esperar, «Sincronizar ahora».' : undefined,
      });
    } catch (e) {
      toast({ title: 'No se ha cambiado', description: mensajeDe(e), variant: 'destructive' });
    } finally { setCambiando(false); }
  }

  async function sincronizarAhora() {
    setSincronizando(true);
    setResultado(null);
    try {
      const res = await client.post<{ ok: boolean; mensaje: string; estado: E }>(`/integrations/google/${servicio}/sincronizar`, { projectId });
      if (res.data) {
        setResultado({ ok: res.data.ok, mensaje: res.data.mensaje });
        if (res.data.estado) alCambiar(res.data.estado);
      }
    } catch (e) {
      setResultado({ ok: false, mensaje: mensajeDe(e) });
    } finally { setSincronizando(false); }
  }

  async function guardarUmbrales(deSerie = false) {
    if (!deSerie && (!texto || hayErrores)) return;
    setGuardando(true);
    try {
      const body = deSerie ? { projectId, umbrales: null } : {
        projectId,
        umbrales: Object.fromEntries(CAMPOS.map((c) => [c.k, Number(texto![c.k].trim())])),
      };
      const res = await client.put<E>('/integrations/google/gsc/umbrales', body);
      if (res.data) alCambiar(res.data);
      toast({ title: deSerie ? 'Umbrales: los de serie' : 'Umbrales guardados', description: 'Valen desde el próximo lunes.' });
    } catch (e) {
      toast({ title: 'No se han guardado los umbrales', description: mensajeDe(e), variant: 'destructive' });
    } finally { setGuardando(false); }
  }

  const a = automatica;

  return (
    <div className="rounded-md border border-border p-3 space-y-3" data-testid={`sincronizacion-${servicio}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5 text-xs">
          <p className="text-[11px] font-semibold text-muted-foreground">Sincronización</p>
          {a ? (
            <>
              <p data-testid="automatica-origen">{deDonde(a)}</p>
              <p className="text-muted-foreground">
                Próxima vuelta: <strong className="text-foreground" data-testid="proxima-vuelta">
                  {a.activa ? (a.proxima_vuelta ? fecha(a.proxima_vuelta) : 'cuando arranque la tarea') : '— (apagada)'}
                </strong>
                {a.activa && <> · cada {a.cada_horas.toLocaleString('es-ES')} h</>}
              </p>
            </>
          ) : null}
          <p className="text-muted-foreground">
            Última: <strong className="text-foreground">{fecha(ultima?.at)}</strong>
            {ultima?.estado === 'ok' && <span className="text-success-soft-foreground"> · bien</span>}
            {ultima?.estado === 'error' && <span className="text-destructive"> · falló{ultima.error ? `: ${ultima.error}` : ''}</span>}
          </p>
        </div>
        {puede && a && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 text-sm font-semibold cursor-pointer select-none">
              <input type="checkbox" role="switch" aria-checked={a.activa} checked={a.activa} disabled={cambiando}
                onChange={(e) => ponerAutomatica(e.target.checked)} className="h-4 w-4 accent-primary" />
              Sincronizar este campus
            </label>
            <button type="button" onClick={sincronizarAhora} disabled={sincronizando}
              title="Una vuelta ya para este campus. No cambia la automática."
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted disabled:opacity-50">
              <ArrowsClockwise size={14} weight="bold" className={sincronizando ? 'animate-spin' : ''} />
              {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
          </div>
        )}
      </div>
      {puede && a?.origen === 'pantalla' && (
        <button type="button" onClick={() => ponerAutomatica(null)} disabled={cambiando}
          className="text-[11px] text-primary hover:underline disabled:opacity-50">
          Dejar que lo decida el servidor ({a.variable})
        </button>
      )}
      {sincronizando && (
        <p className="text-[11px] text-muted-foreground">La primera vez trae meses de datos y puede tardar un par de minutos.</p>
      )}
      {resultado && (
        <p role="status" className={`text-xs p-2 rounded-md break-words ${resultado.ok ? 'bg-success-soft text-success-soft-foreground' : 'bg-destructive-soft text-destructive-soft-foreground'}`}>
          {resultado.mensaje}
        </p>
      )}

      {servicio === 'gsc' && umbrales && texto && (
        <div className="pt-3 border-t border-border space-y-2" data-testid="umbrales-aviso">
          <p className="text-[11px] font-semibold text-muted-foreground">Aviso de caída de los lunes</p>
          <p className="text-[11px] text-muted-foreground">
            Cada lunes se compara la última semana con la anterior y, si cae más de lo que pongas, avisa en la campana a quien ve Search Console en este campus.
            {umbrales.cambiado_por && <> Cambiados por {umbrales.cambiado_por}{umbrales.cambiado_at && <> el {fecha(umbrales.cambiado_at)}</>}.</>}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {CAMPOS.map((c) => {
              const id = `umbral-${c.k}-${projectId}`;
              const err = errores?.[c.k];
              return (
                <div key={c.k}>
                  <label htmlFor={id} className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
                    {c.etiqueta} <span className="font-normal">({ORIGEN_UMBRAL[umbrales.origen[c.k]]})</span>
                  </label>
                  {puede ? (
                    <div className="flex items-center gap-1.5 mt-1">
                      <input id={id} inputMode="numeric" value={texto[c.k]}
                        onChange={(e) => setTexto({ ...texto, [c.k]: e.target.value })}
                        aria-invalid={!!err} aria-describedby={`${id}-frase`}
                        className={`w-28 h-9 px-2 rounded-md border bg-card text-sm font-mono ${err ? 'border-destructive' : 'border-border'}`} />
                      <span className="text-xs text-muted-foreground">{c.unidad}</span>
                    </div>
                  ) : (
                    <p className="mt-1 text-sm font-semibold">{umbrales.valores[c.k].toLocaleString('es-ES')} {c.unidad}</p>
                  )}
                  {err && <p role="alert" className="text-[11px] text-destructive mt-0.5">{err}</p>}
                  <p id={`${id}-frase`} className="text-[11px] text-muted-foreground mt-0.5">{c.frase}</p>
                </div>
              );
            })}
          </div>
          {puede && (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => guardarUmbrales()} disabled={guardando || hayErrores || !cambiaUmbral}
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-50">
                <FloppyDisk size={14} weight="bold" /> {guardando ? 'Guardando…' : 'Guardar umbrales'}
              </button>
              {Object.values(umbrales.origen).includes('pantalla') && (
                <button type="button" onClick={() => guardarUmbrales(true)} disabled={guardando}
                  className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted disabled:opacity-50">
                  <ArrowCounterClockwise size={14} weight="bold" /> Usar los del servidor o los de serie
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
