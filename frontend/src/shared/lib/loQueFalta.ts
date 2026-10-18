/*
  El aviso de lo que falta en un formulario, igual en todos (#106).

  La #106 pide que el error diga «qué falta y cómo arreglarlo». Si falta una
  cosa, su aviso de siempre. Si faltan varias, todas en un solo aviso: antes
  cada formulario decía solo la primera («Falta el nombre») aunque estuviera
  todo vacío, y había que ir descubriéndolas una a una.
*/
export interface Falta {
  /** El aviso cuando es lo único que falta. */
  title: string;
  description: string;
  /** Cómo se nombra dentro de la lista: «el nombre en «Nombre»». */
  que: string;
}

const enLista = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

export function avisoDeLoQueFalta(faltan: Falta[]): { title: string; description: string; variant: 'destructive' } | null {
  if (!faltan.length) return null;
  if (faltan.length === 1) return { title: faltan[0].title, description: faltan[0].description, variant: 'destructive' };
  return { title: 'Faltan datos', description: `Falta ${enLista(faltan.map((f) => f.que))}.`, variant: 'destructive' };
}
