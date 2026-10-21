import { describe, it, expect } from 'vitest';
import {
  cobraDesdeActual, textoCobraDesdeActual, hayQueMandarCobraDesde, confirmacionCobraDesde, avisoCobraDesde,
} from '@/modules/tutores/lib/colaboraciones';
import { todoPagadoDelMes, textoTodoPagado } from '@/modules/tutores/components/LoQueFactura';

/**
 * Dos cosas de comisiones de tutores (Diego, 13/10).
 *
 *  1. «Cobra desde» en Editar tutor: «ni me deja poner la fecha de inicio del
 *     tutor». La fecha pasa a todas sus colaboraciones activas.
 *  2. «Pagado, no hay nada que facturar»: con el mes ya pagado, el cuadro de lo
 *     que factura el tutor no salia y parecia un fallo. Le paso a Sara en
 *     septiembre.
 */

const tramo = (vigente_desde: string, activa = true) => ({ vigente_desde, activa });

describe('1 · el valor inicial de «Cobra desde»', () => {
  it('es la fecha mas temprana de las activas', () => {
    const a = cobraDesdeActual([tramo('2026-08-01'), tramo('2025-10-20'), tramo('2025-10-20'), tramo('2025-10-20')]);
    expect(a.desde).toBe('2025-10-20');
    expect(a.distintas).toBe(true);
  });

  it('las inactivas no cuentan', () => {
    const a = cobraDesdeActual([tramo('2026-08-01'), tramo('2024-01-01', false)]);
    expect(a.desde).toBe('2026-08-01');
    expect(a.distintas).toBe(false);
  });

  it('sin activas no hay valor', () => {
    expect(cobraDesdeActual([tramo('2026-08-01', false)]).desde).toBeNull();
    expect(cobraDesdeActual([]).grupos).toEqual([]);
  });

  it('con fechas distintas lo dice tal cual lo pidio Diego', () => {
    const a = cobraDesdeActual([tramo('2026-08-01'), tramo('2025-10-20'), tramo('2025-10-20'), tramo('2025-10-20')]);
    expect(textoCobraDesdeActual(a)).toBe('Ahora: 3 formaciones desde 20/10/2025, 1 desde 01/08/2026.');
  });

  it('con una sola fecha, cuantas cobran desde ella', () => {
    expect(textoCobraDesdeActual(cobraDesdeActual([tramo('2026-08-01'), tramo('2026-08-01')])))
      .toBe('Ahora: sus 2 formaciones activas cobran desde 01/08/2026.');
    expect(textoCobraDesdeActual(cobraDesdeActual([tramo('2026-08-01')])))
      .toBe('Ahora: su formación activa cobra desde 01/08/2026.');
  });
});

describe('1 · cuando se manda la fecha al guardar', () => {
  const iguales = cobraDesdeActual([tramo('2026-08-01'), tramo('2026-08-01')]);
  const distintas = cobraDesdeActual([tramo('2026-08-01'), tramo('2025-10-20')]);

  it('sin tocar el campo, nunca: guardar el IBAN no iguala las fechas', () => {
    expect(hayQueMandarCobraDesde('2025-10-20', false, distintas)).toBe(false);
    expect(hayQueMandarCobraDesde('2020-01-01', false, iguales)).toBe(false);
  });

  it('tocado y con otra fecha, si', () => {
    expect(hayQueMandarCobraDesde('2025-10-20', true, iguales)).toBe(true);
  });

  it('tocado y con la misma fecha: solo si habia distintas («todas desde aqui»)', () => {
    expect(hayQueMandarCobraDesde('2026-08-01', true, iguales)).toBe(false);
    expect(hayQueMandarCobraDesde('2025-10-20', true, distintas)).toBe(true);
  });

  it('vacio o sin colaboraciones activas, no', () => {
    expect(hayQueMandarCobraDesde('', true, iguales)).toBe(false);
    expect(hayQueMandarCobraDesde('2025-10-20', true, cobraDesdeActual([]))).toBe(false);
  });

  it('igualar fechas distintas se pregunta; iguales, no', () => {
    expect(confirmacionCobraDesde('2025-10-20', distintas)).toMatch(/las 2 pasan a cobrar desde el 20\/10\/2025/);
    expect(confirmacionCobraDesde('2025-10-20', iguales)).toBeNull();
  });
});

describe('1 · el aviso al guardar dice cuantas se cambiaron', () => {
  const base = { desde: '2025-10-20', total: 3, sinCambio: 0, noCambiadas: [] as Array<{ formacion: string; motivo: string }> };

  it('todas cambiadas', () => {
    const a = avisoCobraDesde({ ...base, cambiadas: [{ formacion: 'A' }, { formacion: 'B' }, { formacion: 'C' }] });
    expect(a.title).toBe('Cobra desde el 20/10/2025');
    expect(a.description).toMatch(/^3 formaciones cambiadas\./);
    expect(a.description).toMatch(/Calcular en Comisiones/);
    expect(a.variant).toBe('default');
  });

  it('una no se pudo: en rojo, cual y por que, y no se va sola', () => {
    const a = avisoCobraDesde({
      ...base,
      cambiadas: [{ formacion: 'A' }, { formacion: 'B' }],
      noCambiadas: [{ formacion: 'Logopedia', motivo: 'Se solaparía con otro tramo suyo de esa formación (2026-01-01 a 2026-07-31).' }],
    });
    expect(a.title).toBe('Cobra desde el 20/10/2025: 2 cambiadas, 1 no');
    expect(a.description).toMatch(/«Logopedia»: Se solaparía/);
    expect(a.variant).toBe('destructive');
    expect(a.duration).toBe(0);
  });

  it('si ya cobraba desde esa fecha, lo dice', () => {
    const a = avisoCobraDesde({ ...base, total: 2, sinCambio: 2, cambiadas: [] });
    expect(a.title).toBe('Ya cobraba desde el 20/10/2025');
  });

  it('sin formaciones activas, lo dice', () => {
    expect(avisoCobraDesde({ ...base, total: 0, cambiadas: [] }).title).toBe('No tiene formaciones activas');
  });
});

describe('2 · «Todo pagado, no hay nada que facturar»', () => {
  const c = (estado: string, importe: number, fecha_liquidacion: string | null = null) =>
    ({ estado, importe: String(importe), fecha_liquidacion });

  it('sin comisiones ese mes, nada: se queda como estaba', () => {
    expect(todoPagadoDelMes([])).toBeNull();
    expect(todoPagadoDelMes(undefined)).toBeNull();
  });

  it('con algo pendiente, nada: eso lo pinta el desglose de siempre', () => {
    expect(todoPagadoDelMes([c('pagada', 10, '2026-09-30'), c('notificada', 5)])).toBeNull();
    expect(todoPagadoDelMes([c('falta_factura', 5)])).toBeNull();
  });

  it('el caso de Sara: todo pagado, con cuanto y cuando', () => {
    const r = todoPagadoDelMes([c('pagada', 10.5, '2026-09-30'), c('pagada', 7.32, '2026-09-30')]);
    expect(r).not.toBeNull();
    expect(textoTodoPagado(r!)).toBe('Todo pagado este mes: 17,82 € el 30/09/2026. No hay nada pendiente de facturar.');
  });

  it('pagado en varias fechas: cuantos pagos y el ultimo', () => {
    const r = todoPagadoDelMes([c('pagada', 10, '2026-09-12'), c('pagada', 5, '2026-09-30')]);
    expect(textoTodoPagado(r!)).toMatch(/15,00 € en 2 pagos, el último el 30\/09\/2026/);
  });

  it('con revertidas, las menciona y no las suma a lo pagado', () => {
    const r = todoPagadoDelMes([c('pagada', 10, '2026-09-30'), c('revertida', 4)]);
    const t = textoTodoPagado(r!);
    expect(t).toMatch(/^Todo pagado este mes: 10,00 €/);
    expect(t).toMatch(/Una comisión revertida \(4,00 €\), que no se paga\./);
  });

  it('solo revertidas: tampoco hay nada que facturar, y se dice', () => {
    const r = todoPagadoDelMes([c('revertida', 4), c('revertida', 6)]);
    const t = textoTodoPagado(r!);
    expect(t).toMatch(/2 comisiones revertidas \(10,00 €\), que no se pagan\./);
    expect(t).toMatch(/No hay nada pendiente de facturar\./);
    expect(t).not.toMatch(/Todo pagado/);
  });
});
