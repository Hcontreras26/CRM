// Mock data realista para CRM-108 (Stripe Monitor / Dashboard IA)
import type { StripeMetrics, StripeEvolutionPoint } from '../api/stripe.api';

// Generador de evolucion 12 meses con tendencia + estacionalidad
function generateEvolution(baseMrr: number, baseSubs: number, growth: number): StripeEvolutionPoint[] {
  const now = new Date();
  const months: StripeEvolutionPoint[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthIndex = 11 - i; // 0..11
    const factor = 1 + (monthIndex / 11) * growth;
    const seasonality = 1 + Math.sin((monthIndex / 12) * Math.PI * 2) * 0.06;
    const mrr = Math.round(baseMrr * factor * seasonality * 100) / 100;
    const activeSubs = Math.round(baseSubs * factor * seasonality);
    const newSubs = Math.round(activeSubs * (0.08 + Math.random() * 0.04));
    const cancelledSubs = Math.round(activeSubs * (0.02 + Math.random() * 0.02));
    const churnRate = Math.round((cancelledSubs / Math.max(1, activeSubs)) * 10000) / 100;
    months.push({ mes, mrr, activeSubs, newSubs, cancelledSubs, churnRate });
  }
  return months;
}

/**
 * Por qué se van, de ejemplo (#44).
 *
 * Con los mismos valores que devuelve Stripe en `cancellation_details`, que
 * son los que enseña el panel de cada proyecto. El mock se mantiene al día
 * con el tipo a propósito: uno que se queda corto deja de servir para ver la
 * pantalla, que es justo para lo que existe.
 *
 * «No lo dijo» va con peso de verdad --la mayoría cancela sin decir nada-- 
 * para que la pantalla se vea como se va a ver, y no como nos gustaría.
 */
const POR_QUE_SE_VAN = {
  total: 24,
  motivos: [
    { clave: 'sin_motivo', etiqueta: 'No lo dijo', bajas: 8, pct: 33 },
    { clave: 'unused', etiqueta: 'No lo uso suficiente', bajas: 7, pct: 29 },
    { clave: 'missing_features', etiqueta: 'No cubre mis necesidades', bajas: 4, pct: 17 },
    { clave: 'too_expensive', etiqueta: 'Es demasiado caro', bajas: 3, pct: 13 },
    { clave: 'switched_service', etiqueta: 'He encontrado una alternativa', bajas: 2, pct: 8 },
  ],
};

const COMENTARIOS_DE_BAJA = [
  { cuando: '2026-09-15', motivo: 'No cubre mis necesidades', comentario: 'esperaba poder hablar con una persona de verdad' },
  { cuando: '2026-09-11', motivo: 'Es demasiado caro', comentario: 'lo retomo cuando pueda' },
];

const SAMPLE: Record<string | number, StripeMetrics> = {
  // Psicologo IA
  4: (() => {
    const evo = generateEvolution(6_800, 220, 1.18);
    const last = evo[evo.length - 1];
    return {
      mrr: last.mrr,
      activeSubs: last.activeSubs,
      newSubs: last.newSubs,
      cancelledSubs: last.cancelledSubs,
      failedPayments: 5,
      churnRate: last.churnRate,
      evolution12Months: evo,
      porQueSeVan: POR_QUE_SE_VAN,
      comentariosDeBaja: COMENTARIOS_DE_BAJA,
    };
  })(),
  // Nutricionista IA
  5: (() => {
    const evo = generateEvolution(4_200, 138, 1.32);
    const last = evo[evo.length - 1];
    return {
      mrr: last.mrr,
      activeSubs: last.activeSubs,
      newSubs: last.newSubs,
      cancelledSubs: last.cancelledSubs,
      failedPayments: 3,
      churnRate: last.churnRate,
      evolution12Months: evo,
      porQueSeVan: POR_QUE_SE_VAN,
      comentariosDeBaja: COMENTARIOS_DE_BAJA,
    };
  })(),
  // Tarot IA
  6: (() => {
    const evo = generateEvolution(2_900, 94, 1.45);
    const last = evo[evo.length - 1];
    return {
      mrr: last.mrr,
      activeSubs: last.activeSubs,
      newSubs: last.newSubs,
      cancelledSubs: last.cancelledSubs,
      failedPayments: 2,
      churnRate: last.churnRate,
      evolution12Months: evo,
      porQueSeVan: POR_QUE_SE_VAN,
      comentariosDeBaja: COMENTARIOS_DE_BAJA,
    };
  })(),
};


// Default para proyectos no IA: datos vacios para que el frontend muestre empty state
const EMPTY: StripeMetrics = {
  mrr: 0, activeSubs: 0, newSubs: 0, cancelledSubs: 0, failedPayments: 0, churnRate: 0,
  evolution12Months: [],
};

export function stripeMetricsMock(projectId: string | number): StripeMetrics {
  return SAMPLE[projectId] || EMPTY;
}
