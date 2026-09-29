import { describe, it, expect, vi, beforeEach } from 'vitest';
import { soloRoles, roleGuard } from '../src/shared/middleware/auth.js';

// El panel de claves, tarea #80.
//
// Lo que se prueba aqui son las reglas que el ticket marca como «lo que no
// puede fallar». Son de seguridad: si alguna se rompe, se rompe en silencio y
// se descubre el dia que un secreto sale por donde no debe.

const siguiente = () => {
  const fn = vi.fn();
  return { fn, error: () => fn.mock.calls[0]?.[0] };
};
const pide = (role) => ({ user: role ? { userId: 1, role } : null });

describe('quien entra al panel', () => {
  it('deja pasar a soporte y a superadmin', () => {
    for (const rol of ['soporte', 'superadmin']) {
      const n = siguiente();
      soloRoles('soporte', 'superadmin')(pide(rol), null, n.fn);
      expect(n.error()).toBeUndefined();
    }
  });

  it('no deja pasar a admin, ni a gestor, ni a tutor', () => {
    for (const rol of ['admin', 'gestor', 'tutor', 'project_manager']) {
      const n = siguiente();
      soloRoles('soporte', 'superadmin')(pide(rol), null, n.fn);
      expect(n.error()?.statusCode).toBe(403);
    }
  });

  it('sin sesion, 401 y no 403', () => {
    // Distinguirlos importa: 403 le dice a quien prueba que la ruta existe y
    // que su token vale, solo que no le llega el rol.
    const n = siguiente();
    soloRoles('superadmin')(pide(null), null, n.fn);
    expect(n.error()?.statusCode).toBe(401);
  });

  it('un rol que no existia hereda el acceso con roleGuard, y NO con soloRoles', () => {
    // Esta es la razon de ser de `soloRoles` y lo que denuncia el ticket:
    // `roleGuard` deja pasar a soporte ANTES de mirar la lista de permitidos.
    const conGuard = siguiente();
    roleGuard('admin')(pide('soporte'), null, conGuard.fn);
    expect(conGuard.error()).toBeUndefined();          // pasa aunque no este en la lista

    const conSolo = siguiente();
    soloRoles('admin')(pide('soporte'), null, conSolo.fn);
    expect(conSolo.error()?.statusCode).toBe(403);     // aqui no
  });
});

// ─────────────────────────────────────────────────────────────────────────────

const filas = [];
vi.mock('../src/shared/config/db.js', () => ({
  query: vi.fn(async (sql, params) => {
    filas.push({ sql, params });
    return { rows: [] };
  }),
}));

const registro = await import('../src/modules/credentials/credentials.registro.js');

beforeEach(() => { filas.length = 0; });

describe('el registro de accesos', () => {
  const req = { user: { userId: 7 }, ip: '10.0.0.1', headers: {} };

  it('anota quien, que y desde donde', async () => {
    await registro.anotar(req, registro.ACCIONES.VER,
      { id: 3, servicio: 'brevo', projectId: 1, entorno: 'produccion' });
    const [{ sql, params }] = filas;
    expect(sql).toMatch(/INSERT INTO user_activity_log/);
    expect(params[0]).toBe(7);
    expect(params[1]).toBe('credencial.ver');
    expect(params[3]).toBe('10.0.0.1');
  });

  it('NUNCA guarda el valor de la credencial', async () => {
    // La regla del fichero, y no admite excepcion: un registro que guarda
    // secretos es un segundo sitio del que robarlos, y encima nadie lo vigila
    // porque «solo es un log».
    await registro.anotar(req, registro.ACCIONES.CAMBIAR, {
      id: 3, servicio: 'brevo', projectId: 1, entorno: 'produccion',
      // Aunque a alguien se le cuele por parametro, no debe acabar dentro.
      value: 'xkeysib-secreto-de-verdad',
    });
    const detalles = filas[0].params[2];
    expect(detalles).not.toMatch(/xkeysib/);
    expect(detalles).not.toMatch(/secreto/);
    expect(JSON.parse(detalles)).toEqual({
      id: 3, servicio: 'brevo', project_id: 1, entorno: 'produccion',
    });
  });

  it('si falla el registro, no revienta la operacion', async () => {
    // Pero se avisa fuerte: un acceso sin anotar es justo lo que esto evita.
    const db = await import('../src/shared/config/db.js');
    db.query.mockRejectedValueOnce(new Error('base caida'));
    await expect(registro.anotar(req, registro.ACCIONES.VER, { servicio: 'brevo' }))
      .resolves.toBeUndefined();
  });

  it('el historial solo trae lo de credenciales', async () => {
    // La tabla la comparten los inicios de sesion y lo de WhatsApp.
    await registro.historial({});
    expect(filas[0].sql).toMatch(/action LIKE 'credencial\.%'/);
  });

  it('el historial tiene tope, aunque pidan un millon', async () => {
    await registro.historial({ limite: 1000000 });
    expect(filas[0].params[2]).toBe(500);
  });
});
