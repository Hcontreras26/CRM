import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

/*
  CRM#1220 · La líder de equipo con `leads.delete` no veía «Eliminar» en los
  prospectos de su equipo (Raquel, user 5; el lead 22553 es de Christine, 51).

  El servidor dice en cada fila de la lista si se puede eliminar
  (`puede_eliminar`), con la misma regla que `softDelete`. Gemela de la de
  CRM-ISEIE (paridad).
*/

const estado = vi.hoisted(() => ({ permisos: {}, alcance: null, conVenta: [] }));

vi.mock('../src/shared/config/db.js', () => {
  const query = vi.fn(async (sql) => {
    if (/FROM conversions/.test(sql)) return { rows: estado.conVenta.map((id) => ({ lead_id: id })) };
    return { rows: [] };
  });
  return { default: { query }, query, getClient: vi.fn() };
});
vi.mock('../src/shared/middleware/permissions.js', () => ({
  tienePermiso: vi.fn(async (_req, ...claves) => claves.some((c) => estado.permisos[c] === true)),
}));
vi.mock('../src/shared/utils/roles.js', async (orig) => ({
  ...(await orig()),
  alcanceComercial: vi.fn(async () => estado.alcance),
}));

const { marcarPuedeEliminar } = await import('../src/modules/leads/puede-eliminar.js');

const RAQUEL = { userId: 5, role: 'lider_equipo', roles_extra: [] };
const EQUIPO = [5, 2, 12, 51];
const filas = () => [
  { id: 22553, responsable_id: 51 },   // de Christine, de su equipo
  { id: 22554, responsable_id: 5 },    // suyo
  { id: 22555, responsable_id: 99 },   // de otra gestora, fuera de su equipo
  { id: 22556, responsable_id: 12 },   // de su equipo, pero con venta
  { id: 22557, responsable_id: null }, // sin asignar
];
const porId = (leads) => Object.fromEntries(leads.map((l) => [l.id, l.puede_eliminar]));

beforeEach(() => {
  estado.permisos = {};
  estado.alcance = null;
  estado.conVenta = [];
});

describe('puede_eliminar en la lista de prospectos', () => {
  it('Raquel, líder con leads.delete: los de su equipo y los suyos, sin venta; los de fuera no', async () => {
    estado.permisos = { 'leads.delete': true };
    estado.alcance = EQUIPO;
    estado.conVenta = [22556];
    const r = porId(await marcarPuedeEliminar({ user: RAQUEL }, filas()));
    expect(r).toEqual({ 22553: true, 22554: true, 22555: false, 22556: false, 22557: false });
  });

  it('una gestora con leads.delete: solo los suyos sin venta', async () => {
    estado.permisos = { 'leads.delete': true };
    estado.alcance = [12];
    estado.conVenta = [22556];
    const r = porId(await marcarPuedeEliminar({ user: { userId: 12, role: 'gestor' } }, filas()));
    expect(r).toEqual({ 22553: false, 22554: false, 22555: false, 22556: false, 22557: false });
    const suyo = await marcarPuedeEliminar({ user: { userId: 12, role: 'gestor' } }, [{ id: 1, responsable_id: 12 }]);
    expect(suyo[0].puede_eliminar).toBe(true);
  });

  it('sin leads.delete, ninguno (tampoco la líder)', async () => {
    estado.alcance = EQUIPO;
    const r = await marcarPuedeEliminar({ user: RAQUEL }, filas());
    expect(r.every((l) => l.puede_eliminar === false)).toBe(true);
  });

  it('con leads.delete_cualquiera, todos, también los que tienen venta', async () => {
    estado.permisos = { 'leads.delete': true, 'leads.delete_cualquiera': true };
    estado.conVenta = [22556];
    const r = await marcarPuedeEliminar({ user: { userId: 3, role: 'admin' } }, filas());
    expect(r.every((l) => l.puede_eliminar === true)).toBe(true);
  });

  it('quien ve todo el campus sin delete_cualquiera: todos los que no tienen venta', async () => {
    estado.permisos = { 'leads.delete': true };
    estado.alcance = null;
    estado.conVenta = [22556];
    const r = porId(await marcarPuedeEliminar({ user: { userId: 3, role: 'admin' } }, filas()));
    expect(r).toEqual({ 22553: true, 22554: true, 22555: true, 22556: false, 22557: true });
  });

  it('una lista vacía no pregunta nada', async () => {
    expect(await marcarPuedeEliminar({ user: RAQUEL }, [])).toEqual([]);
  });
});

describe('la regla es la del borrado', () => {
  const controlador = readFileSync(new URL('../src/modules/leads/lead.controller.js', import.meta.url), 'utf8');
  it('la lista marca cada fila', () => {
    expect(controlador).toMatch(/await marcarPuedeEliminar\(req, result\.leads\)/);
  });
  it('softDelete sigue pidiendo lo mismo: delete_cualquiera, o su alcance, motivo de gestora y sin venta', () => {
    const softDelete = controlador.slice(controlador.indexOf('export async function softDelete'));
    const cuerpo = softDelete.slice(0, softDelete.indexOf('\n}\n'));
    expect(cuerpo).toMatch(/tienePermiso\(req, 'leads\.delete_cualquiera'\)/);
    expect(cuerpo).toMatch(/exigirQueSeaSuyo\(req, id\)/);
    expect(cuerpo).toMatch(/FROM conversions WHERE lead_id/);
  });
});
