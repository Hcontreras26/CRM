import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Diego, 30/09/2026: solo entran en el proceso los prospectos de septiembre en
// adelante («todos es de este mes de septiembre»). Los de antes no salen en la cola, no tienen
// pasos en la ficha y su estado no se mueve solo.

let filas = [];
const consultas = [];
const cliente = { query: vi.fn(async (sql, params) => { consultas.push({ sql, params }); return { rows: filas }; }), release: vi.fn() };

vi.mock('../src/shared/config/db.js', () => ({
  getClient: vi.fn(async () => cliente),
  query: vi.fn(async (sql, params) => { consultas.push({ sql, params }); return { rows: filas }; }),
}));

const { EN_EL_PROCESO, inicioDelProceso } = await import('../src/shared/utils/enElProceso.js');
const Proceso = await import('../src/modules/proceso/proceso.model.js');
const { avanzarPorContacto, devolverLosVencidos } = await import('../src/shared/services/estado-prospecto.service.js');
const { FILTROS_RAPIDOS, contarFiltrosRapidos } = await import('../src/modules/leads/lead.model.js');

const REGLA = "COALESCE(l.fecha_solicitud, l.created_at) >= TIMESTAMPTZ '2026-09-01 00:00 Europe/Madrid'";
const sql = () => consultas.map((c) => c.sql).join('\n');

beforeEach(() => { filas = []; consultas.length = 0; delete process.env.PROCESO_INICIO; });
afterEach(() => { delete process.env.PROCESO_INICIO; });

describe('la fecha de inicio', () => {
  it('es el 01/09/2026 si no se dice otra cosa', () => {
    expect(inicioDelProceso()).toBe('2026-09-01');
    expect(EN_EL_PROCESO('l')).toContain(REGLA);
  });

  it('se puede mover desde el .env', () => {
    process.env.PROCESO_INICIO = '2026-10-01';
    expect(EN_EL_PROCESO('x')).toContain("COALESCE(x.fecha_solicitud, x.created_at) >= TIMESTAMPTZ '2026-10-01 00:00 Europe/Madrid'");
  });

  it('una fecha mal escrita no entra en el SQL: se queda la de siempre', () => {
    process.env.PROCESO_INICIO = "2026-01-01' OR 1=1 --";
    expect(inicioDelProceso()).toBe('2026-09-01');
    expect(EN_EL_PROCESO()).not.toContain('OR 1=1');
  });
});

describe('los de antes del 01/09 quedan fuera del proceso', () => {
  it('no se les escribe agenda', async () => {
    await Proceso.planificarPasosDeLead(7);
    expect(sql()).toContain('INSERT INTO lead_steps');
    expect(sql()).toContain(REGLA);
  });

  it('la ficha no les enseña pasos', async () => {
    await Proceso.pasosDeLead(7);
    expect(sql()).toContain(REGLA);
  });

  it('no salen en la cola del día', async () => {
    await Proceso.colaDelDia({ projectIds: [1] });
    expect(sql()).toContain(REGLA);
  });

  it('ni en su desplegable de formaciones', async () => {
    await Proceso.colaDelDia({ projectIds: [1], soloFormaciones: true });
    expect(sql()).toContain(REGLA);
  });

  it('ni en los contadores (campana, resumen diario, «para hoy»)', async () => {
    filas = [{ atrasados: 0, hoy: 0, manana: 0, esta_semana: 0 }];
    await Proceso.resumenDeLaCola({ projectIds: [1] });
    expect(sql()).toContain(REGLA);
  });

  it('no vuelven solos a «por contactar» cuando vence un paso', async () => {
    await devolverLosVencidos();
    expect(consultas.find((c) => c.sql.includes('ls.fecha_prevista < CURRENT_DATE')).sql).toContain(REGLA);
  });
});

describe('el estado al apuntar un contacto', () => {
  it('a uno de antes del 01/09 no se le mueve: lo cambia una persona', async () => {
    filas = [{ status: 'por_contactar', contactos: 2, pasos_marcados: 0, en_el_proceso: false }];
    expect(await avanzarPorContacto(7, 1)).toBeNull();
    expect(consultas.some((c) => c.sql.includes('UPDATE leads'))).toBe(false);
  });

  it('a uno que entró desde el 01/09 sí, como hasta ahora', async () => {
    filas = [{ status: 'por_contactar', contactos: 1, pasos_marcados: 0, en_el_proceso: true }];
    expect(await avanzarPorContacto(7, 1)).toEqual({ anterior: 'por_contactar', nuevo: 'contactado' });
  });
});

describe('la barra de vencidos de Prospectos también cuenta desde el 01/09', () => {
  // Diego, 30/09: «los atrasados y eso también que sean a partir de esa fecha».
  const CLAVES = ['overdue', 'today', 'tomorrow', 'week', 'no-reminder', 'no-contact', 'urgent'];

  it.each(CLAVES)('el filtro «%s» deja fuera a los de antes', (clave) => {
    expect(FILTROS_RAPIDOS[clave]).toContain(REGLA);
  });

  it('y los números de arriba (y el «recordatorio vencido» del resumen diario) igual', async () => {
    filas = [{ overdue: 0 }];
    await contarFiltrosRapidos({ projectIds: [1] });
    const q = sql();
    for (const campo of ['AS overdue', 'AS today', 'AS no_contact', 'AS urgent']) {
      const antes = q.slice(0, q.indexOf(campo));
      expect(antes.slice(antes.lastIndexOf('COUNT(*) FILTER'))).toContain(REGLA);
    }
  });

  it('si se mueve la fecha, la barra se mueve con ella', () => {
    process.env.PROCESO_INICIO = '2026-10-01';
    expect(FILTROS_RAPIDOS.overdue).toContain("TIMESTAMPTZ '2026-10-01 00:00 Europe/Madrid'");
  });
});
