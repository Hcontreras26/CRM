import { describe, it, expect, vi } from 'vitest';

/**
 * CRM#632 · El admin ve Configuración › Claves, con lo de SUS campus.
 *
 * La auditoría del 03/11 encontró al admin del 360 sin Claves (y en ISEIE,
 * Informes le daba 403 en /credentials). Diego: «el admin debe ver todo de
 * todo», cada uno con los datos de sus campus. `credentials.view` pasa a traerlo
 * el admin, y el servidor recorta:
 *
 *   · superadmin y soporte, todo, como antes;
 *   · el admin, las de sus campus y que existen las generales (la de Claude),
 *     sin los cuatro últimos caracteres de esas;
 *   · la paridad y el registro, solo de sus campus.
 *
 *   npx vitest run tests/clavesDelAdmin632.test.js
 */

const FILAS = [
  { id: 1, project_id: null, service: 'claude', cola: 'AbCd', masked_value: '••••••••AbCd' },
  { id: 2, project_id: 7, service: 'brevo', cola: 'x7x7', masked_value: '••••••••x7x7' },
  { id: 3, project_id: 9, service: 'brevo', cola: 'y9y9', masked_value: '••••••••y9y9' },
];

vi.mock('../src/shared/config/db.js', () => ({ query: vi.fn(async () => ({ rows: [] })) }));
vi.mock('../src/modules/credentials/credentials.model.js', () => ({
  list: vi.fn(async () => FILAS),
  paridad: vi.fn(async () => [
    { project_id: 7, service: 'brevo', falta_en: 'pruebas' },
    { project_id: 9, service: 'brevo', falta_en: 'pruebas' },
    { project_id: null, service: 'claude', falta_en: 'pruebas' },
  ]),
}));
vi.mock('../src/modules/credentials/credentials.registro.js', () => ({
  anotar: vi.fn(),
  ACCIONES: {},
  historial: vi.fn(async () => [
    { id: 10, action: 'credencial.cambiar', details: { project_id: 7, servicio: 'brevo' } },
    { id: 11, action: 'credencial.cambiar', details: { project_id: 9, servicio: 'brevo' } },
    { id: 12, action: 'credencial.ver', details: { project_id: null, servicio: 'claude' } },
  ]),
}));
vi.mock('../src/shared/utils/ambito.js', () => ({
  veTodoElCrm: (u) => ['superadmin', 'soporte'].includes(u?.role),
  campusDeLaPersona: vi.fn(async () => [7]),
}));

const ctrl = await import('../src/modules/credentials/credentials.controller.js');

async function llamar(fn, role, query = {}) {
  let cuerpo = null; let error = null;
  await fn({ user: { userId: 5, role }, query }, { json: (b) => { cuerpo = b; } }, (e) => { error = e; });
  if (error) throw error;
  return cuerpo.data;
}

describe('la lista de claves', () => {
  it('superadmin y soporte, todas y con su cola', async () => {
    for (const role of ['superadmin', 'soporte']) {
      const d = await llamar(ctrl.list, role);
      expect(d.map((c) => c.id)).toEqual([1, 2, 3]);
      expect(d[0].cola).toBe('AbCd');
    }
  });

  it('el admin, las de sus campus y las generales, sin campus ajenos', async () => {
    const d = await llamar(ctrl.list, 'admin');
    expect(d.map((c) => c.id)).toEqual([1, 2]);
  });

  it('de las generales, el admin no ve los cuatro últimos caracteres', async () => {
    const d = await llamar(ctrl.list, 'admin');
    const general = d.find((c) => c.id === 1);
    expect(general.cola).toBeNull();
    expect(general.masked_value).not.toMatch(/AbCd/);
    expect(d.find((c) => c.id === 2).cola).toBe('x7x7');
  });
});

describe('la paridad y el registro', () => {
  it('el admin, solo de sus campus', async () => {
    expect((await llamar(ctrl.paridad, 'admin')).map((p) => p.project_id)).toEqual([7]);
    expect((await llamar(ctrl.registro, 'admin')).map((r) => r.id)).toEqual([10]);
  });

  it('superadmin, todo', async () => {
    expect(await llamar(ctrl.paridad, 'superadmin')).toHaveLength(3);
    expect(await llamar(ctrl.registro, 'superadmin')).toHaveLength(3);
  });
});

describe('el catálogo (#423)', () => {
  it('ver claves lo trae el admin; guardar y revelar, no', async () => {
    const { SECCIONES } = await import('../src/modules/permissions/catalogo.js');
    const recurso = SECCIONES.flatMap((s) => s.recursos).find((r) => r.clave === 'credentials');
    const accion = (a) => recurso.acciones.find((x) => x.accion === a);
    expect(accion('view').roles).toContain('admin');
    expect(accion('edit').roles).not.toContain('admin');
    expect(accion('revelar').roles).not.toContain('admin');
  });
});
