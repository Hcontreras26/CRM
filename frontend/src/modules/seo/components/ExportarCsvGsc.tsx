import { FileCsv } from '@phosphor-icons/react';
import { celdaCsv, rangoEnNombre } from '@/shared/lib/csv';
import type { ConsultaGsc, PaginaGsc } from '../api/searchConsole.api';

/**
 * Las búsquedas y las páginas de «Tráfico orgánico» a CSV (#1193), como el de
 * Google Analytics: separado por «;» y con la coma decimal, que es lo que abre
 * en columnas el Excel en español; con BOM para las tildes. Las búsquedas las
 * escribe gente de fuera, así que cada celda pasa por `celdaCsv` (una que
 * empiece por «=» sale con apóstrofo y no se ejecuta como fórmula).
 *
 * Se monta con lo que ya carga la pantalla, con el buscador aplicado: el
 * fichero lleva las filas que se ven. Si la lista llegó al tope que pide la
 * pantalla, el botón lo dice.
 */

const SEP = ';';
/** Marca de UTF-8 al principio: sin ella, Excel abre las tildes mal. */
const BOM = String.fromCharCode(0xFEFF);
const decimal = (n: number | null | undefined, max: number) =>
  (n == null ? '' : n.toLocaleString('es-ES', { maximumFractionDigits: max, useGrouping: false }));
const entero = (n: number | null | undefined) => (n == null ? '' : n);
const fila = (celdas: unknown[]) => celdas.map(celdaCsv).join(SEP);

const CIFRAS = ['Clics', 'Clics periodo anterior', 'Impresiones', 'CTR (%)', 'Posición'];

export function consultasEnCsv(filas: ConsultaGsc[]): string {
  const lineas = [fila(['Búsqueda', ...CIFRAS])];
  for (const c of filas) {
    lineas.push(fila([c.consulta, entero(c.clics), entero(c.clics_antes), entero(c.impresiones),
      decimal(c.ctr, 2), decimal(c.posicion, 1)]));
  }
  return lineas.join('\r\n');
}

export function paginasEnCsv(filas: PaginaGsc[]): string {
  const lineas = [fila(['Página', ...CIFRAS])];
  for (const p of filas) {
    lineas.push(fila([`${p.host}${p.ruta}`, entero(p.clics), entero(p.clics_antes), entero(p.impresiones),
      decimal(p.ctr, 2), decimal(p.posicion, 1)]));
  }
  return lineas.join('\r\n');
}

function descargar(texto: string, nombre: string) {
  const url = URL.createObjectURL(new Blob([BOM + texto], { type: 'text/csv;charset=utf-8;' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Un momento después: soltarla en el acto corta la descarga en Firefox y Safari (#1154).
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** El nombre del fichero: sin barras ni caracteres que Windows no admite. */
export const nombreFichero = (que: string, campus: string, desde: string, hasta: string) =>
  `${que}-gsc-${campus.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'campus'}-${rangoEnNombre(desde, hasta)}.csv`;

export function BotonCsv({ etiqueta, generar, nombre, filas, tope, recortada }: {
  /** «búsquedas» o «páginas», para el texto de ayuda. */
  etiqueta: string;
  generar: () => string;
  nombre: string;
  /** Las filas que se ven (con el buscador aplicado). */
  filas: number;
  /** Lo más que pide la pantalla al servidor. */
  tope: number;
  /** La lista que llegó del servidor está en el tope: hay más que no se ven. */
  recortada: boolean;
}) {
  const ayuda = filas === 0
    ? `No hay ${etiqueta} que exportar`
    : recortada
      ? `La pantalla solo carga las ${tope} primeras ${etiqueta} del periodo; el resto no sale. Exporta las ${filas} que se ven.`
      : `Exporta las ${filas} ${etiqueta} que se ven.`;
  return (
    <button type="button" onClick={() => descargar(generar(), nombre)} disabled={filas === 0} title={ayuda}
      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border text-xs font-semibold hover:bg-muted disabled:opacity-40 whitespace-nowrap">
      <FileCsv size={14} weight="bold" aria-hidden="true" /> Exportar CSV{recortada && filas > 0 ? ` (de las ${tope} primeras)` : ''}
    </button>
  );
}
