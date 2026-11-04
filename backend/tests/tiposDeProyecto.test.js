import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Los tipos de proyecto (#15), y que la base pueda guardarlos.
 *
 * Estaban escritos a mano en TRES sitios: el enum de Postgres y dos
 * `z.enum(['crm','ia'])` en la validacion. Anadir uno obligaba a acordarse de
 * los tres, y olvidar uno no da error hasta que alguien lo usa.
 *
 * Lo que se fija aqui es sobre todo lo segundo: que elegir un tipo que la
 * migracion todavia no ha creado diga QUE PASA. Sin eso, Postgres contesta
 * 22P02 «invalid input value for enum» y el CRM lo tapa con «error del
 * sistema» — que es exactamente lo que ya nos costo media hora con
 * `lead_status` y `proxima_convocatoria`, buscando en el sitio equivocado.
 */

const query = vi.fn();
vi.mock('../src/shared/config/db.js', () => ({ query: (...a) => query(...a) }));

const modelo = {
  create: vi.fn(async (d) => ({ id: 1, ...d })),
  update: vi.fn(async (id, d) => ({ id, ...d })),
  slugExists: vi.fn(async () => false),
};
vi.mock('../src/modules/projects/project.model.js', () => modelo);

let ctrl; let tipos;

/** La base solo conoce estos. */
const laBaseTiene = (claves) => {
  query.mockResolvedValue({ rows: claves.map((clave) => ({ clave })) });
};

function fingirRes() {
  const res = { codigo: 200, cuerpo: null };
  res.status = (c) => { res.codigo = c; return res; };
  res.json = (c) => { res.cuerpo = c; return res; };
  return res;
}

// Configurar un campus mira de quién es (admin de empresa con `projects.edit`):
// aquí llama quien ve el CRM entero, que es lo que se está probando.
const SUPER = { userId: 1, role: 'superadmin' };

async function llamar(handler, req) {
  const res = fingirRes();
  let error = null;
  await handler(req, res, (e) => { error = e; });
  return { res, error };
}

beforeEach(async () => {
  vi.resetModules();
  query.mockReset();
  modelo.create.mockClear();
  modelo.update.mockClear();
  ctrl = await import('../src/modules/projects/project.controller.js');
  tipos = await import('../src/modules/projects/tipos.js');
  tipos.olvidar();
});

describe('el catalogo', () => {
  it('trae los seis, con su etiqueta', async () => {
    laBaseTiene(['crm', 'ia']);
    const { res } = await llamar(ctrl.types, {});
    const claves = res.cuerpo.data.map((t) => t.key);
    expect(claves).toEqual(['crm', 'ia', 'educacion', 'ecommerce', 'servicios', 'inmobiliaria']);
    expect(res.cuerpo.data[2].label).toBe('Centro educativo');
  });

  it('dice cual puede usarse HOY', async () => {
    laBaseTiene(['crm', 'ia']);
    const { res } = await llamar(ctrl.types, {});
    const porClave = Object.fromEntries(res.cuerpo.data.map((t) => [t.key, t.disponible]));
    expect(porClave.crm).toBe(true);
    expect(porClave.educacion, 'sin la 140 no se puede guardar').toBe(false);
  });

  it('y con la migracion aplicada, todos', async () => {
    laBaseTiene(['crm', 'ia', 'educacion', 'ecommerce', 'servicios', 'inmobiliaria']);
    const { res } = await llamar(ctrl.types, {});
    expect(res.cuerpo.data.every((t) => t.disponible)).toBe(true);
  });

  it('los ensena TODOS aunque no esten disponibles', async () => {
    // Esconder los que faltan haria parecer que no se ha hecho.
    laBaseTiene(['crm', 'ia']);
    const { res } = await llamar(ctrl.types, {});
    expect(res.cuerpo.data).toHaveLength(6);
  });
});

describe('crear un proyecto', () => {
  const cuerpo = (type) => ({ body: { nombre: 'Nuevo', slug: 'nuevo', type }, params: {} });

  it('con un tipo que la base acepta, se crea', async () => {
    laBaseTiene(['crm', 'ia']);
    const { error } = await llamar(ctrl.create, cuerpo('ia'));
    expect(error).toBeNull();
    expect(modelo.create).toHaveBeenCalled();
  });

  it('con uno que falta por migrar, se explica y NO se intenta', async () => {
    laBaseTiene(['crm', 'ia']);
    const { error } = await llamar(ctrl.create, cuerpo('educacion'));
    expect(error?.code).toBe('TIPO_NO_DISPONIBLE');
    expect(error?.statusCode).toBe(409);
    expect(error?.message, 'tiene que decir que migracion falta').toMatch(/140/);
    expect(modelo.create, 'llego a la base y reventaria con 22P02').not.toHaveBeenCalled();
  });

  it('con uno que no existe en ningun sitio, lo para la validacion', async () => {
    laBaseTiene(['crm', 'ia']);
    const { error } = await llamar(ctrl.create, cuerpo('cualquiera'));
    expect(error?.code).toBe('VALIDATION_ERROR');
  });

  it('y con la 140 aplicada, entra', async () => {
    laBaseTiene(['crm', 'ia', 'educacion', 'ecommerce', 'servicios', 'inmobiliaria']);
    const { error } = await llamar(ctrl.create, cuerpo('educacion'));
    expect(error).toBeNull();
    expect(modelo.create).toHaveBeenCalled();
  });
});

describe('cambiar el tipo de uno que ya existe', () => {
  it('tambien se comprueba', async () => {
    laBaseTiene(['crm', 'ia']);
    const { error } = await llamar(ctrl.update, { user: SUPER, params: { id: '3' }, body: { type: 'ecommerce' } });
    expect(error?.code).toBe('TIPO_NO_DISPONIBLE');
    expect(modelo.update).not.toHaveBeenCalled();
  });

  it('y lo que no toca el tipo pasa igual', async () => {
    laBaseTiene(['crm', 'ia']);
    const { error } = await llamar(ctrl.update, { user: SUPER, params: { id: '3' }, body: { nombre: 'Otro' } });
    expect(error).toBeNull();
    expect(modelo.update).toHaveBeenCalled();
  });
});

describe('si la base no contesta', () => {
  it('se supone lo que habia, en vez de quedarse sin poder crear nada', async () => {
    query.mockRejectedValue(new Error('sin conexion'));
    const { error } = await llamar(ctrl.create, { body: { nombre: 'N', slug: 'n', type: 'crm' }, params: {} });
    expect(error).toBeNull();
  });
});
