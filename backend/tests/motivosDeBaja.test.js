import { describe, it, expect } from 'vitest';
import { agrupaPorMotivo, comentarios } from '../src/modules/ia-monitor/motivosDeBaja.js';

/**
 * Por qué se van, en los proyectos IA (#44).
 *
 * Es la única cifra de retención accionable: que el churn sea del 8 % no se
 * puede arreglar; que cuatro de cada diez digan «no lo uso suficiente» sí, y
 * apunta a un sitio distinto que si dijeran «es demasiado caro».
 *
 * Los motivos son los de Stripe —los mismos que ya enseña el panel de cada
 * proyecto—, así que esto lee la clasificación que se usa en vez de inventar
 * otra.
 */

const baja = (feedback, comment) => ({
  canceled_at: 1757894400,
  cancellation_details: { feedback, comment: comment || null },
});

describe('los motivos de baja', () => {
  it('agrupa y ordena de mayor a menor', () => {
    const r = agrupaPorMotivo([
      baja('unused'), baja('unused'), baja('too_expensive'),
    ]);
    expect(r.total).toBe(3);
    expect(r.motivos[0]).toMatchObject({ etiqueta: 'No lo uso suficiente', bajas: 2, pct: 67 });
    expect(r.motivos[1].bajas).toBe(1);
  });

  it('quien no dijo nada CUENTA, y se ve', () => {
    // Si de 24 bajas 20 no dijeron nada, el reparto de las otras 4 no
    // representa a nadie — y eso hay que verlo antes de sacar conclusiones,
    // que es justo cuando se sacan.
    const r = agrupaPorMotivo([baja(null), baja(null), baja('unused')]);
    const sin = r.motivos.find((m) => m.clave === 'sin_motivo');
    expect(sin).toMatchObject({ etiqueta: 'No lo dijo', bajas: 2 });
  });

  it('un motivo que Stripe añada mañana no rompe nada', () => {
    // Cae en «no lo dijo» en vez de aparecer con su nombre en ingles o de
    // tumbar el bloque entero.
    const r = agrupaPorMotivo([baja('motivo_que_no_existia')]);
    expect(r.motivos[0].clave).toBe('sin_motivo');
  });

  it('sin bajas no hay reparto', () => {
    expect(agrupaPorMotivo([])).toEqual({ total: 0, motivos: [] });
  });

  it('los comentarios se leen sueltos, no se cuentan', () => {
    // Resumir en un porcentaje lo que alguien escribió a mano lo convierte en
    // otra cosa. Van aparte y con su fecha.
    const c = comentarios([baja('other', '  esperaba sesiones con persona  '), baja('unused')]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ motivo: 'Otro motivo', comentario: 'esperaba sesiones con persona' });
    expect(c[0].cuando).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
