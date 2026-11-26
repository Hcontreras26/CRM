import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * El aviso de la semana de Search Console (CRM#1156). Sin base: `gsc_diario`,
 * los avisos ya dados y los admin del campus, simulados.
 *
 *   npx vitest run tests/searchConsoleAviso1156.test.js
 */

const diario = new Map();      // fecha → { clics, impresiones, posicion_suma }
let avisos = [];               // lo que ha escrito notifyUsers
let admins = [7, 8];
let sinPermiso = new Set();     // ids a los que se les ha quitado search_console.view

vi.mock('../src/shared/config/db.js', () => ({
  getClient: vi.fn(),
  query: vi.fn(async (sql, params = []) => {
    if (/MAX\(fecha\)/.test(sql)) {
      const fechas = [...diario.keys()].sort();
      return { rows: [{ ultimo: fechas.at(-1) || null }] };
    }
    if (/FROM gsc_diario WHERE project_id = \$1 AND fecha BETWEEN/.test(sql)) {
      const [, desde, hasta] = params;
      const filas = [...diario.entries()].filter(([f]) => f >= desde && f <= hasta).map(([, v]) => v);
      if (!filas.length) return { rows: [{ clics: null, impresiones: null, posicion_suma: null, dias: 0 }] };
      const s = (k) => filas.reduce((a, f) => a + f[k], 0);
      return { rows: [{ clics: s('clics'), impresiones: s('impresiones'), posicion_suma: s('posicion_suma'), dias: filas.length }] };
    }
    if (/FROM admin_notifications/.test(sql)) {
      const [tipo, pid, lunes] = params;
      const hay = avisos.some((a) => a.type === tipo && String(a.metadata.project_id) === pid && a.metadata.lunes === lunes);
      return { rows: hay ? [{ '?column?': 1 }] : [] };
    }
    if (/FROM users u/.test(sql)) return { rows: admins.map((id) => ({ id })) };
    throw new Error(`SQL no simulado: ${sql.slice(0, 60)}`);
  }),
}));

vi.mock('../src/modules/permissions/permissions.service.js', () => ({
  explicarPermisos: vi.fn(async (id) => ({ mapa: { 'search_console.view': !sinPermiso.has(id) } })),
}));

vi.mock('../src/modules/notifications/notifications.service.js', () => ({
  notifyUsers: vi.fn(async (n) => { avisos.push(n); return { id: avisos.length }; }),
  notifyAdmins: vi.fn(),
}));

const aviso = await import('../src/modules/search-console/search-console.aviso.js');
const { TIPOS } = await import('../src/modules/notifications/tipos.js');
const { semanas, umbrales, caidas, avisarSiCae, enMadrid, variacion } = aviso;

// Lunes 23/11/2026 a las 11:00 en Madrid. Search Console tiene hasta el domingo 22.
const LUNES = new Date('2026-11-23T10:00:00Z');
const U = umbrales({});

/** 14 días hasta el 22/11: la semana anterior con `antes` clics al día, la última con `ahora`. */
function llenar({ antes = 100, ahora = 100, imprAntes = 1000, imprAhora = 1000, hasta = '2026-11-22', faltan = [] } = {}) {
  diario.clear();
  const fin = Date.parse(`${hasta}T00:00:00Z`);
  for (let i = 0; i < 14; i += 1) {
    const f = new Date(fin - i * 86400000).toISOString().slice(0, 10);
    if (faltan.includes(f)) continue;
    const ultima = i < 7;
    const impresiones = ultima ? imprAhora : imprAntes;
    diario.set(f, { clics: ultima ? ahora : antes, impresiones, posicion_suma: (ultima ? 9 : 8) * impresiones });
  }
}

beforeEach(() => {
  avisos = [];
  admins = [7, 8];
  sinPermiso = new Set();
});

describe('las cuentas', () => {
  it('la semana son los 7 días que acaban en el último con datos, y la anterior los 7 de antes', () => {
    expect(semanas('2026-11-22')).toEqual({
      actual: { desde: '2026-11-16', hasta: '2026-11-22' },
      anterior: { desde: '2026-11-09', hasta: '2026-11-15' },
    });
  });

  it('los umbrales, de serie y del .env (0 apaga)', () => {
    expect(U).toEqual({ clics: 30, impresiones: 30, minClics: 20, minImpresiones: 200 });
    expect(umbrales({ GSC_AVISO_CAIDA_CLICS: '50', GSC_AVISO_CAIDA_IMPRESIONES: '0', GSC_AVISO_MIN_CLICS: 'x' }))
      .toMatchObject({ clics: 50, impresiones: 0, minClics: 20 });
  });

  it('la variación, con un decimal y null sin semana anterior', () => {
    expect(variacion(60, 100)).toBe(-40);
    expect(variacion(1, 3)).toBe(-66.7);
    expect(variacion(5, 0)).toBeNull();
  });

  it('el lunes se mira en Madrid, no en UTC', () => {
    expect(enMadrid(new Date('2026-11-22T23:30:00Z'))).toEqual({ diaSemana: 1, dia: '2026-11-23' });
    expect(enMadrid(new Date('2026-11-22T22:30:00Z')).diaSemana).toBe(0);
  });

  it('una caída del 30 % justo no es «más del 30 %»', async () => {
    llenar({ antes: 100, ahora: 70 });
    const s = await aviso.semanaDe(1, { ahora: LUNES });
    expect(s.variacion.clics).toBe(-30);
    expect(caidas(s, U)).toEqual([]);
  });
});

describe('el aviso de los lunes', () => {
  it('baja del 40 % en clics → aviso a los admin del campus, con enlace y sin datos personales', async () => {
    llenar({ antes: 100, ahora: 60 });
    const r = await avisarSiCae(3, 'Psiko Aprende', { ahora: LUNES, u: U });
    expect(r).toMatchObject({ avisado: true, lunes: '2026-11-23' });
    expect(avisos).toHaveLength(1);
    const [n] = avisos;
    expect(n).toMatchObject({ type: 'gsc_caida', targetUserIds: [7, 8], link_path: '/trafico-organico' });
    expect(n.title).toBe('Psiko Aprende: clics -40 % en Google esta semana');
    expect(n.message).toMatch(/420 clics \(antes 700\)/);
    expect(n.message).toMatch(/Posición media 9 \(\+1\)/);
    expect(n.metadata).toEqual({
      project_id: 3, lunes: '2026-11-23', desde: '2026-11-16', hasta: '2026-11-22',
      caidas: [{ metrica: 'clics', variacion: -40 }],
    });
  });

  it('baja del 10 % → nada', async () => {
    llenar({ antes: 100, ahora: 90 });
    const r = await avisarSiCae(3, 'Psiko Aprende', { ahora: LUNES, u: U });
    expect(r).toEqual({ avisado: false, motivo: 'sin_caida' });
    expect(avisos).toHaveLength(0);
  });

  it('también avisa si caen las impresiones', async () => {
    llenar({ imprAntes: 1000, imprAhora: 500 });
    const r = await avisarSiCae(3, 'Fono Aprende', { ahora: LUNES, u: U });
    expect(r.avisado).toBe(true);
    expect(avisos[0].title).toBe('Fono Aprende: impresiones -50 % en Google esta semana');
  });

  it('una vez por campus y lunes, aunque el cron dé varias vueltas', async () => {
    llenar({ antes: 100, ahora: 60 });
    await avisarSiCae(3, 'Psiko', { ahora: LUNES, u: U });
    const otra = await avisarSiCae(3, 'Psiko', { ahora: new Date('2026-11-23T16:00:00Z'), u: U });
    expect(otra).toMatchObject({ avisado: false, motivo: 'ya_avisado' });
    // Otro campus el mismo lunes, sí.
    const otro = await avisarSiCae(4, 'Fono', { ahora: LUNES, u: U });
    expect(otro.avisado).toBe(true);
    expect(avisos).toHaveLength(2);
  });

  it('por debajo del mínimo de volumen no avisa (de 5 clics a 2 no es nada)', async () => {
    llenar({ antes: 2, ahora: 1 });   // 14 → 7 clics a la semana: −50 %
    expect((await avisarSiCae(3, 'Psiko', { ahora: LUNES, u: U })).motivo).toBe('sin_caida');
  });

  it('con días sin datos no compara: un hueco no es un cero', async () => {
    llenar({ antes: 100, ahora: 60, faltan: ['2026-11-18'] });
    expect(await avisarSiCae(3, 'Psiko', { ahora: LUNES, u: U })).toEqual({ avisado: false, motivo: 'semana_incompleta' });
  });

  it('con la sincronización parada (datos de hace semanas) no avisa', async () => {
    llenar({ antes: 100, ahora: 60, hasta: '2026-10-25' });
    expect((await avisarSiCae(3, 'Psiko', { ahora: LUNES, u: U })).motivo).toBe('semana_incompleta');
  });

  it('un campus sin Search Console (sin filas) no da error', async () => {
    diario.clear();
    expect(await aviso.semanaDe(9, { ahora: LUNES })).toEqual({ con_datos: false });
    expect(await avisarSiCae(9, 'Sin GSC', { ahora: LUNES, u: U })).toEqual({ avisado: false, motivo: 'sin_datos' });
  });

  it('un campus sin admin no se lo cuenta a los de otros campus', async () => {
    llenar({ antes: 100, ahora: 60 });
    admins = [];
    expect(await avisarSiCae(3, 'Psiko', { ahora: LUNES, u: U })).toEqual({ avisado: false, motivo: 'sin_destinatarios' });
    expect(avisos).toHaveLength(0);
  });

  it('solo a quien tiene search_console.view: al que se le quitó no le llega un aviso que le daría 403', async () => {
    llenar({ antes: 100, ahora: 60 });
    sinPermiso = new Set([8]);
    await avisarSiCae(3, 'Psiko', { ahora: LUNES, u: U });
    expect(avisos[0].targetUserIds).toEqual([7]);
  });

  it('si en el campus nadie puede verlo, no se avisa a nadie', async () => {
    llenar({ antes: 100, ahora: 60 });
    sinPermiso = new Set([7, 8]);
    expect(await avisarSiCae(3, 'Psiko', { ahora: LUNES, u: U })).toEqual({ avisado: false, motivo: 'sin_destinatarios' });
  });

  it('el tipo está en el mapa de la campana y pide acción', () => {
    expect(TIPOS.gsc_caida).toMatchObject({ clase: 'accion', agrupa: false });
  });
});
