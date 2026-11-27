import { useEffect, useState } from 'react';
import { TrendDown } from '@phosphor-icons/react';
import { searchConsoleApi, type Semana } from '../api/searchConsole.api';

/**
 * La línea de arriba de «Tráfico orgánico» (CRM#1156): la última semana de
 * Search Console contra la anterior. Es la misma cuenta que el aviso de los
 * lunes; lo que avisaría sale en rojo.
 *
 * No molesta: sin datos no pinta nada, y si la petición falla, tampoco (la
 * pantalla tiene sus propios avisos de error).
 */

const num = (n: number) => new Intl.NumberFormat('es-ES').format(n);
const dec = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const diaCorto = (s: string) => new Date(`${s}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
const signo = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '±');

function Cambio({ valor, enPuntos = false, menosEsMejor = false, alerta = false }: {
  valor: number | null | undefined; enPuntos?: boolean; menosEsMejor?: boolean; alerta?: boolean;
}) {
  if (valor == null) return null;
  const mejora = menosEsMejor ? valor < 0 : valor > 0;
  const tono = alerta ? 'text-destructive font-semibold' : valor === 0 ? 'text-muted-foreground' : mejora ? 'text-success' : 'text-muted-foreground';
  return <span className={tono}> ({signo(valor)}{dec(Math.abs(valor))}{enPuntos ? '' : ' %'})</span>;
}

export function LineaSemana({ semana }: { semana: Semana | null }) {
  if (!semana?.con_datos || !semana.actual || !semana.anterior) return null;
  const { actual: a, variacion: v, caidas = [] } = semana;
  const periodo = `Semana del ${diaCorto(a.desde)} al ${diaCorto(a.hasta)}`;

  if (!semana.completa) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="linea-semana">
        {periodo}: {semana.reciente ? 'faltan días en Search Console' : 'Search Console no tiene datos de esta semana'}, no se compara con la anterior.
      </p>
    );
  }
  return (
    <p className="flex flex-wrap items-center gap-x-1 text-xs" data-testid="linea-semana">
      {caidas.length > 0 && <TrendDown size={14} weight="bold" className="text-destructive" aria-label="Ha caído" />}
      <span className="text-muted-foreground">{periodo} contra la anterior:</span>
      <span>
        <span className="tabular-nums font-semibold">{num(a.clics)}</span> clics
        <Cambio valor={v?.clics} alerta={caidas.includes('clics')} />
      </span>
      <span className="text-muted-foreground">·</span>
      <span>
        <span className="tabular-nums font-semibold">{num(a.impresiones)}</span> impresiones
        <Cambio valor={v?.impresiones} alerta={caidas.includes('impresiones')} />
      </span>
      {a.posicion != null && (
        <>
          <span className="text-muted-foreground">·</span>
          <span>
            posición media <span className="tabular-nums font-semibold">{dec(a.posicion)}</span>
            <Cambio valor={v?.posicion} enPuntos menosEsMejor />
          </span>
        </>
      )}
    </p>
  );
}

/** Pide la semana del campus conectado; `recarga` cambia tras sincronizar. */
export function useSemanaGsc(projectId: number | null, conectado: boolean, recarga: unknown = null) {
  const [semana, setSemana] = useState<Semana | null>(null);
  useEffect(() => {
    setSemana(null);
    if (!projectId || !conectado) return undefined;
    let vivo = true;
    searchConsoleApi.semana(projectId)
      .then((s) => { if (vivo) setSemana(s || null); })
      .catch(() => { if (vivo) setSemana(null); });
    return () => { vivo = false; };
  }, [projectId, conectado, recarga]);
  return semana;
}

export default LineaSemana;
