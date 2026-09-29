/**
 * El tono de cada estado del embudo. Uno solo, para todo el módulo.
 *
 * Estaba escrito cuatro veces y con valores distintos: el punto del menú
 * rápido, las columnas del pipeline, las píldoras del desplegable de filtros y
 * la página de audiencias. Cuatro sitios donde «convertido» era violeta en uno,
 * esmeralda en otro y azul en el tercero — y ninguno coincidía con la etiqueta
 * que salía en la misma fila de la tabla.
 *
 * El criterio es el de `StatusBadge`: el color dice **qué hay que hacer**, no
 * cuál de los siete estados es.
 *
 *   info        aún no toca nada
 *   warning     hay algo pendiente
 *   neutro      hecho, esperando
 *   success     ganó
 *   destructive perdió
 */

export type Tono = 'info' | 'warning' | 'neutro' | 'success' | 'destructive';

export const TONO_DE_ESTADO: Record<string, Tono> = {
  nuevo: 'info',
  proxima_convocatoria: 'info',
  por_contactar: 'warning',
  en_seguimiento: 'warning',
  contactado: 'neutro',
  convertido: 'success',
  no_interesado: 'destructive',
};

/** El punto de color: relleno sólido. */
export const PUNTO: Record<Tono, string> = {
  info: 'bg-info',
  warning: 'bg-warning',
  neutro: 'bg-muted-foreground/50',
  success: 'bg-success',
  destructive: 'bg-destructive',
};

/** El fondo suave de una columna o una tarjeta de ese estado. */
export const FONDO: Record<Tono, string> = {
  info: 'bg-info-soft',
  warning: 'bg-warning-soft',
  neutro: 'bg-muted',
  success: 'bg-success-soft',
  destructive: 'bg-destructive-soft',
};

/** El halo al arrastrar sobre una columna. */
export const HALO: Record<Tono, string> = {
  info: 'ring-info/40',
  warning: 'ring-warning/40',
  neutro: 'ring-muted-foreground/30',
  success: 'ring-success/40',
  destructive: 'ring-destructive/40',
};

/**
 * El color como valor CSS, para lo que no admite una clase: un `style` en
 * línea, el relleno de una gráfica. Sale de la misma variable que la clase, así
 * que no se pueden separar — que es justo lo que había pasado con los seis
 * hexadecimales sueltos.
 */
export const CSS: Record<Tono, string> = {
  info: 'hsl(var(--info))',
  warning: 'hsl(var(--warning))',
  neutro: 'hsl(var(--muted-foreground))',
  success: 'hsl(var(--success))',
  destructive: 'hsl(var(--destructive))',
};

export const tonoDeEstado = (estado?: string | null): Tono => TONO_DE_ESTADO[estado || ''] || 'neutro';
export const puntoDeEstado = (estado?: string | null): string => PUNTO[tonoDeEstado(estado)];
export const fondoDeEstado = (estado?: string | null): string => FONDO[tonoDeEstado(estado)];
export const haloDeEstado = (estado?: string | null): string => HALO[tonoDeEstado(estado)];
export const cssDeEstado = (estado?: string | null): string => CSS[tonoDeEstado(estado)];
