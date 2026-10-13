import { describe, it, expect, vi, beforeEach } from 'vitest';

// #199 · tres fallos de la ficha de Matrículas, vistos en la prueba a mano del 12/10:
//   1. «Guardar campos» con el título o las notas en blanco daba «Datos invalidos»;
//   2. validar desde la ficha también (manda motivo_rechazo: null);
//   3. después de guardar, validar o subir un documento, la ficha se quedaba sin
//      el nombre de la persona: la respuesta no llevaba el JOIN del prospecto.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-pruebas';

const model = { findById: vi.fn(), update: vi.fn(), setEstado: vi.fn() };
vi.mock('../src/modules/matriculas/matricula.model.js', () => model);
vi.mock('../src/shared/services/localStorage.service.js', () => ({
  getLocal: vi.fn(), saveLocal: vi.fn(async () => {}), deleteLocal: vi.fn(),
}));

const { updateSchema, setEstadoSchema } = await import('../src/modules/matriculas/matricula.validation.js');
const ctrl = await import('../src/modules/matriculas/matricula.controller.js');

const CON_NOMBRE = { id: 5, project_id: 1, lead_nombre: 'María López', estado: 'datos_validados' };

async function llamar(fn, req) {
  let salida = null;
  let error = null;
  const res = { json: (d) => { salida = d; return res; }, status() { return res; } };
  await fn({ user: { userId: 2, role: 'superadmin' }, query: {}, ...req }, res, (e) => { error = e; });
  return { salida, error };
}

beforeEach(() => {
  vi.clearAllMocks();
  model.findById.mockResolvedValue(CON_NOMBRE);
  // Lo que devuelve un UPDATE … RETURNING *: la fila sin el nombre del prospecto.
  model.update.mockResolvedValue({ id: 5, project_id: 1 });
  model.setEstado.mockResolvedValue({ id: 5, project_id: 1, estado: 'datos_validados' });
});

describe('los campos vacíos de la ficha', () => {
  it('«Guardar campos» con el título y las notas en blanco (null) se acepta', () => {
    expect(updateSchema.safeParse({ dni: '11111111A', titulo: null, notas: null }).success).toBe(true);
  });

  it('validar manda motivo_rechazo: null, y se acepta', () => {
    expect(setEstadoSchema.safeParse({ estado: 'datos_validados', motivo_rechazo: null }).success).toBe(true);
  });

  it('rechazar sigue pidiendo el motivo', async () => {
    const { error } = await llamar(ctrl.setEstado, { params: { id: '5' }, body: { estado: 'rechazada', motivo_rechazo: null } });
    expect(error?.code).toBe('MOTIVO_REQUIRED');
  });
});

describe('la ficha no se queda sin nombre', () => {
  it('después de guardar los campos', async () => {
    const { salida } = await llamar(ctrl.update, { params: { id: '5' }, body: { dni: '11111111A', titulo: null, notas: null } });
    expect(salida.data.lead_nombre).toBe('María López');
  });

  it('después de validar', async () => {
    const { salida } = await llamar(ctrl.setEstado, { params: { id: '5' }, body: { estado: 'datos_validados', motivo_rechazo: null } });
    expect(salida.data.lead_nombre).toBe('María López');
  });

  it('después de subir un documento', async () => {
    const { salida } = await llamar(ctrl.uploadDoc, {
      params: { id: '5', tipo: 'dni' },
      file: { originalname: 'dni.jpg', buffer: Buffer.from('x') },
    });
    expect(salida.data.lead_nombre).toBe('María López');
  });
});
