/**
 * Por qué se van, según lo que dijeron al darse de baja (#44).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DE DÓNDE SALE
 *
 * De Stripe. Cuando alguien cancela y elige un motivo, Stripe lo guarda en
 * `cancellation_details.feedback` con un juego de valores fijo. Los mismos que
 * ya enseña el panel de cada proyecto IA —«no lo uso suficiente», «no cubre mis
 * necesidades», «he encontrado una alternativa»…—, así que esto no inventa una
 * clasificación nueva: lee la que ya se está usando.
 *
 * Importa porque es la única de las cifras de retención que dice algo
 * ACCIONABLE. Que el churn sea del 8 % no se puede arreglar; que cuatro de
 * cada diez digan «no lo uso suficiente» sí.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SIN MOTIVO TAMBIÉN CUENTA
 *
 * Quien cancela sin decir por qué entra como «no lo dijo», y no se esconde:
 * si de 24 bajas 20 no dijeron nada, el reparto de las otras 4 no representa
 * a nadie, y eso hay que poder verlo antes de sacar conclusiones.
 */

/** Los valores de Stripe, dichos como los dice el panel de cada proyecto. */
export const MOTIVOS = {
  unused: 'No lo uso suficiente',
  missing_features: 'No cubre mis necesidades',
  switched_service: 'He encontrado una alternativa',
  too_expensive: 'Es demasiado caro',
  too_complex: 'Es difícil de usar',
  low_quality: 'No me convenció la calidad',
  customer_service: 'Por la atención recibida',
  other: 'Otro motivo',
};

/**
 * Agrupa las bajas por motivo.
 *
 * Recibe las suscripciones canceladas tal como las devuelve Stripe. Devuelve
 * la lista ordenada de mayor a menor, con su porcentaje, y el total — que es
 * el que permite juzgar si el reparto significa algo.
 */
export function agrupaPorMotivo(canceladas = []) {
  const cuenta = new Map();
  for (const s of canceladas) {
    const feedback = s?.cancellation_details?.feedback || null;
    const clave = feedback && MOTIVOS[feedback] ? feedback : 'sin_motivo';
    cuenta.set(clave, (cuenta.get(clave) || 0) + 1);
  }
  const total = canceladas.length;
  return {
    total,
    // Los comentarios escritos a mano NO se agregan: son de cada persona y
    // resumirlos en un porcentaje los convierte en otra cosa. Se leen sueltos.
    motivos: [...cuenta.entries()]
      .map(([clave, n]) => ({
        clave,
        etiqueta: clave === 'sin_motivo' ? 'No lo dijo' : MOTIVOS[clave],
        bajas: n,
        pct: total ? Math.round((n / total) * 100) : 0,
      }))
      .sort((a, b) => b.bajas - a.bajas),
  };
}

/** Los comentarios que dejaron escritos, para leerlos, no para contarlos. */
export function comentarios(canceladas = []) {
  return canceladas
    .map((s) => ({
      cuando: s?.canceled_at ? new Date(s.canceled_at * 1000).toISOString().slice(0, 10) : null,
      motivo: MOTIVOS[s?.cancellation_details?.feedback] || null,
      comentario: (s?.cancellation_details?.comment || '').trim() || null,
    }))
    .filter((c) => c.comentario);
}
