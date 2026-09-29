import RepartoEnBarras from '@/shared/components/ui/RepartoEnBarras';

/**
 * Cómo se reparte el dinero pendiente según lo cerca que esté de vencer.
 *
 * Es la columna que en Prospectos ocupa «Salud comercial»: allí el reparto es
 * por estado del embudo y aquí por plazo, que es la misma pregunta —¿dónde
 * está lo que hay que mirar?— con la moneda de esta pantalla.
 *
 * Reparte importes, no recibos: da igual que sean tres cuotas o una si lo que
 * se debe es lo mismo.
 */

function euros(n: number): string {
  // Con centimos: son tramos de dinero pendiente de cobro.
  return new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(n || 0);
}

export interface Tramos {
  vencido: number;
  semana: number;
  mes: number;
  despues: number;
  sinFecha: number;
}

// De lo más urgente a lo que menos, que es el orden en que se mira.
const TRAMOS: Array<{ clave: keyof Tramos; etiqueta: string; barra: string }> = [
  { clave: 'vencido', etiqueta: 'Vencido', barra: 'bg-destructive' },
  { clave: 'semana', etiqueta: 'Esta semana', barra: 'bg-warning' },
  { clave: 'mes', etiqueta: 'Este mes', barra: 'bg-info' },
  { clave: 'despues', etiqueta: 'Más adelante', barra: 'bg-muted-foreground/50' },
  { clave: 'sinFecha', etiqueta: 'Sin fecha', barra: 'bg-muted-foreground/30' },
];

export default function SaludDeCobro({
  tramos, onVerPorCobrar,
}: {
  tramos: Tramos;
  onVerPorCobrar?: () => void;
}) {
  const total = TRAMOS.reduce((s, t) => s + (tramos[t.clave] || 0), 0);

  return (
    <RepartoEnBarras
      titulo="Salud de cobro"
      descripcion="Cuánto se debe y cómo de cerca está de vencer."
      total={total}
      filas={TRAMOS.map((t) => ({
        clave: String(t.clave),
        etiqueta: t.etiqueta,
        barra: t.barra,
        n: tramos[t.clave] || 0,
        // En euros: un porcentaje de recibos no dice cuánto dinero es.
        texto: euros(tramos[t.clave] || 0),
      }))}
      accion={onVerPorCobrar ? { texto: 'Por cobrar', onClick: onVerPorCobrar } : undefined}
    />
  );
}
