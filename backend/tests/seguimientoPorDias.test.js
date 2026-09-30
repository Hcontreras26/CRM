import { describe, it, expect, vi, beforeEach } from 'vitest';

// «En seguimiento» es que se le ha vuelto a contactar OTRO DÍA, no que tenga dos
// contactos. Diego, 30/09: «no a todos les han hecho seguimiento». #3965 entró el
// 30/09, tuvo un WhatsApp y una llamada ese mismo día, y el CRM lo puso solo en
// «en seguimiento».

let filas = [];
const consultas = [];

vi.mock('../src/shared/config/db.js', () => ({
  getClient: vi.fn(),
  query: vi.fn(async (sql, params) => { consultas.push({ sql, params }); return { rows: filas }; }),
}));

const { avanzarPorContacto } = await import('../src/shared/services/estado-prospecto.service.js');

const lead = (x) => ({ status: 'por_contactar', contactos: 0, pasos_marcados: 0, dias: 0, en_el_proceso: true, ...x });
const movio = () => consultas.some((c) => c.sql.includes('UPDATE leads'));

beforeEach(() => { filas = []; consultas.length = 0; });

describe('el estado al apuntar un contacto', () => {
  it('dos contactos el MISMO día: contactado, no en seguimiento', async () => {
    filas = [lead({ contactos: 2, dias: 1 })];
    expect(await avanzarPorContacto(3965, 1)).toEqual({ anterior: 'por_contactar', nuevo: 'contactado' });
  });

  it('y si ya estaba en contactado, se queda ahí', async () => {
    filas = [lead({ status: 'contactado', contactos: 3, dias: 1 })];
    expect(await avanzarPorContacto(3965, 1)).toBeNull();
    expect(movio()).toBe(false);
  });

  it('contactado otro día: en seguimiento', async () => {
    filas = [lead({ status: 'contactado', contactos: 2, dias: 2 })];
    expect(await avanzarPorContacto(7, 1)).toEqual({ anterior: 'contactado', nuevo: 'en_seguimiento' });
  });

  it('quien marca a mano el paso 2 ya habló con ella dos veces', async () => {
    filas = [lead({ status: 'contactado', pasos_marcados: 2, dias: 1 })];
    expect(await avanzarPorContacto(7, 1)).toEqual({ anterior: 'contactado', nuevo: 'en_seguimiento' });
  });

  it('los días se cuentan en Madrid, con contactos y pasos marcados juntos', async () => {
    filas = [lead({ contactos: 1, dias: 1 })];
    await avanzarPorContacto(7, 1);
    const sql = consultas[0].sql;
    expect(sql).toContain("count(DISTINCT d)");
    expect(sql).toContain("(li.fecha AT TIME ZONE 'Europe/Madrid')::date");
    expect(sql).toContain("(ls.hecho_at AT TIME ZONE 'Europe/Madrid')::date");
    expect(sql).toContain("li.tipo <> 'nota'");
  });

  it('sin ningún contacto no se mueve nada', async () => {
    filas = [lead({})];
    expect(await avanzarPorContacto(7, 1)).toBeNull();
  });
});
