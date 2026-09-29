// Piezas de presentacion que estaban copiadas en varios modulos a la vez.
//
// Antes de tocar esto habia 5 copias de AVATAR_COLORS, 6 de getInitials y 14 de
// inputClass — con seis valores distintos entre ellas. Aqui hay UNA. El resto se
// va apuntando aqui segun se toca cada pantalla; no se migran todas de golpe
// porque cambiar 30 archivos a la vez no se puede revisar.

/**
 * La paleta de identidad: el color de un avatar.
 *
 * **Es la única excepción a «todo con tokens», y a propósito.** Los tokens
 * dicen qué significa algo —esto va bien, esto es un aviso—, y aquí no hay
 * significado: hacen falta ocho matices que se distingan entre sí para
 * reconocer a una persona o una marca de un vistazo. Un token semántico no
 * puede dar eso. Lo que sí se exige es que la paleta esté **en un solo sitio**,
 * y este es.
 *
 * Llevaba variante clara y nada más, así que en modo oscuro pintaba un fondo
 * claro con texto oscuro: legible, pero un parche blanco en una pantalla negra.
 * Ahora lleva las dos.
 */
export const AVATAR_COLORS: ReadonlyArray<string> = [
  'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300',
  'bg-teal-100 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300',
  'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300',
];

/** Color estable para un avatar: el mismo id siempre pinta el mismo color. */
export function avatarColorFor(id: number): string {
  return AVATAR_COLORS[Math.abs(id) % AVATAR_COLORS.length];
}

/**
 * Lo mismo, pero cuando lo que identifica es un nombre y no un número — las
 * marcas. El color sale del propio nombre, así que ISECD es verde hoy y verde
 * mañana: la memoria visual funciona porque el color no cambia.
 */
export function avatarColorForName(nombre = ''): string {
  let n = 0;
  for (const ch of String(nombre)) n = (n * 31 + ch.charCodeAt(0)) % 9973;
  return AVATAR_COLORS[n % AVATAR_COLORS.length];
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '??';
  return name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export const inputClass =
  'w-full h-9 px-3 rounded-md border border-border bg-muted/50 text-sm outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card placeholder:text-muted-foreground';
