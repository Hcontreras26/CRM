import {
  describe, it, expect, vi, beforeEach, afterEach,
} from 'vitest';

/**
 * El tope de gasto en IA (#22, la condicion para encender #30).
 *
 * Hoy hay dos sitios que llaman a Anthropic y ninguno cuenta lo que gasta. Esto
 * fija las tres cosas que hacen que un tope sea un tope:
 *
 *   1. Se mira ANTES de llamar. Mirarlo despues es mirar el deposito al llegar.
 *   2. Un modelo que no conocemos no cuesta cero. Cero seria el tope
 *      desapareciendo justo cuando alguien cambia CLAUDE_MODEL.
 *   3. Cuando el contador no puede apuntar, se nota. Un contador ciego que
 *      calla es peor que no tenerlo, porque parece que hay tope.
 */

const consultas = [];
let tablaExiste = true;
let fallaElInsert = false;
let fallaLaSuma = false;
let filas = [];

vi.mock('../src/shared/config/db.js', () => ({
  query: vi.fn(async (sql, params) => {
    consultas.push({ sql, params });
    if (sql.includes('information_schema')) {
      return { rows: tablaExiste ? [{ '?column?': 1 }] : [] };
    }
    if (sql.includes('INSERT INTO ia_gasto')) {
      if (fallaElInsert) throw new Error('relation "ia_gasto" does not exist');
      filas.push(params);
      return { rows: [] };
    }
    if (sql.includes('SUM(coste_usd)')) {
      if (fallaLaSuma) throw new Error('connection terminated');
      const gastado = filas.reduce((a, p) => a + Number(p[8]), 0);
      return {
        rows: [{
          gastado,
          llamadas: filas.length,
          inciertas: filas.filter((p) => p[9]).length,
        }],
      };
    }
    return { rows: [] };
  }),
}));

const avisos = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
vi.mock('../src/shared/utils/logger.js', () => ({ logger: avisos }));

const gasto = await import('../src/shared/services/gastoIA.service.js');

const TOPE_ORIGINAL = process.env.IA_TOPE_MENSUAL_USD;

beforeEach(() => {
  consultas.length = 0;
  filas = [];
  tablaExiste = true;
  fallaElInsert = false;
  fallaLaSuma = false;
  avisos.warn.mockClear();
  avisos.error.mockClear();
  gasto._olvidar();
  process.env.IA_TOPE_MENSUAL_USD = '10';
});

afterEach(() => {
  if (TOPE_ORIGINAL === undefined) delete process.env.IA_TOPE_MENSUAL_USD;
  else process.env.IA_TOPE_MENSUAL_USD = TOPE_ORIGINAL;
});

describe('el precio de cada modelo', () => {
  it('los que conocemos salen exactos y sin marcar', () => {
    expect(gasto.precioDe('claude-sonnet-4-5')).toEqual({ entrada: 3, salida: 15, incierto: false });
    expect(gasto.precioDe('claude-opus-5')).toEqual({ entrada: 5, salida: 25, incierto: false });
    expect(gasto.precioDe('claude-haiku-4-5')).toEqual({ entrada: 1, salida: 5, incierto: false });
  });

  it('el prefijo de Bedrock no cambia el modelo, asi que no cambia el precio', () => {
    expect(gasto.precioDe('anthropic.claude-sonnet-4-5').entrada).toBe(3);
    expect(gasto.precioDe('anthropic.claude-sonnet-4-5').incierto).toBe(false);
  });

  it('uno que no esta en la tabla pero si sabemos de que familia, se cobra por familia y se marca', () => {
    // `claude-opus-4-5` no esta en la lista exacta. Cobrarlo de sonnet seria
    // contar de menos; cobrarlo del mas caro, de mas. Se cobra de opus.
    const p = gasto.precioDe('claude-opus-4-5');
    expect(p.entrada).toBe(5);
    expect(p.incierto).toBe(true);
  });

  it('uno que no reconocemos de nada se cobra al mas caro, NUNCA a cero', () => {
    // Este es el punto. Si un modelo desconocido costara cero, el tope
    // desapareceria en silencio el dia que alguien toque CLAUDE_MODEL.
    const p = gasto.precioDe('modelo-que-salio-ayer');
    expect(p).toEqual({ entrada: 10, salida: 50, incierto: true });
  });
});

describe('lo que cuesta una llamada', () => {
  it('un millon de entrada y uno de salida en sonnet son 3 + 15', () => {
    const { usd } = gasto.costeDe({ modelo: 'claude-sonnet-4-5', entrada: 1e6, salida: 1e6 });
    expect(usd).toBe(18);
  });

  it('la cache se cobra distinto: leer 0.1x, escribir 1.25x', () => {
    const leer = gasto.costeDe({ modelo: 'claude-sonnet-4-5', cacheLectura: 1e6 });
    const escribir = gasto.costeDe({ modelo: 'claude-sonnet-4-5', cacheEscritura: 1e6 });
    expect(leer.usd).toBe(0.3);
    expect(escribir.usd).toBe(3.75);
  });

  it('una llamada corta no se redondea a cero', () => {
    // Con dos decimales esto seria 0.00 y el mes entero sumaria nada.
    const { usd } = gasto.costeDe({ modelo: 'claude-haiku-4-5', entrada: 500, salida: 200 });
    expect(usd).toBeGreaterThan(0);
  });

  it('sin tokens no cuesta nada', () => {
    expect(gasto.costeDe({ modelo: 'claude-sonnet-4-5' }).usd).toBe(0);
  });
});

describe('leer el tope de la configuracion', () => {
  it('si no hay variable, 20 USD', () => {
    delete process.env.IA_TOPE_MENSUAL_USD;
    expect(gasto.topeMensual()).toBe(20);
  });

  it('cero quiere decir sin tope, y eso es una decision valida', () => {
    process.env.IA_TOPE_MENSUAL_USD = '0';
    expect(gasto.topeMensual()).toBe(0);
  });

  it('un valor mal escrito NO se convierte en «sin tope» callando', () => {
    // «IA_TOPE_MENSUAL_USD=veinte» no puede acabar siendo barra libre.
    process.env.IA_TOPE_MENSUAL_USD = 'veinte';
    expect(gasto.topeMensual()).toBe(20);
    expect(avisos.error).toHaveBeenCalled();
  });

  it('un negativo tampoco', () => {
    process.env.IA_TOPE_MENSUAL_USD = '-5';
    expect(gasto.topeMensual()).toBe(20);
  });
});

describe('cuando la migracion 145 todavia no esta aplicada', () => {
  beforeEach(() => { tablaExiste = false; });

  it('no revienta: el chat sigue funcionando igual que hoy', async () => {
    const e = await gasto.estado();
    expect(e.instalado).toBe(false);
    expect(e.agotado).toBe(false);
  });

  it('deja pasar las llamadas, porque hoy tampoco habia tope', async () => {
    const permiso = await gasto.compruebaAntesDeGastar();
    expect(permiso.permitido).toBe(true);
  });

  it('pero lo dice, para que no parezca que hay tope', async () => {
    const e = await gasto.estado();
    expect(e.aviso).toMatch(/145/);
    expect(avisos.warn).toHaveBeenCalled();
  });

  it('avisa una vez, no en cada llamada', async () => {
    await gasto.estado();
    await gasto.estado();
    await gasto.estado();
    expect(avisos.warn).toHaveBeenCalledTimes(1);
  });

  it('se entera solo cuando alguien aplica la migracion', async () => {
    expect((await gasto.estado()).instalado).toBe(false);
    // La aplica Diego en el servidor. Sin reiniciar el proceso.
    tablaExiste = true;
    gasto._olvidar();
    expect((await gasto.estado()).instalado).toBe(true);
  });
});

describe('el estado del mes', () => {
  it('empieza a cero y deja pasar', async () => {
    const e = await gasto.estado();
    expect(e.gastado).toBe(0);
    expect(e.agotado).toBe(false);
    expect((await gasto.compruebaAntesDeGastar()).permitido).toBe(true);
  });

  it('avisa cuando queda poco, sin cortar todavia', async () => {
    // tope 10, gastamos 8 → 80%
    await gasto.registrar({
      origen: 'chat', modelo: 'claude-sonnet-4-5', entrada: 1e6, salida: 333333,
    });
    const e = await gasto.estado();
    expect(e.porcentaje).toBeGreaterThanOrEqual(80);
    expect(e.cerca).toBe(true);
    expect(e.agotado).toBe(false);
    expect((await gasto.compruebaAntesDeGastar()).permitido).toBe(true);
  });

  it('corta al llegar al tope, y dice por que', async () => {
    await gasto.registrar({
      origen: 'chat', modelo: 'claude-sonnet-4-5', entrada: 1e6, salida: 1e6,
    });
    const e = await gasto.estado();
    expect(e.agotado).toBe(true);
    expect(e.cerca).toBe(false);

    const permiso = await gasto.compruebaAntesDeGastar();
    expect(permiso.permitido).toBe(false);
    // «avisar y parar, no fallar en silencio»: el motivo tiene que servir para
    // saber que hacer, no solo para saber que no se puede.
    expect(permiso.motivo).toMatch(/tope/i);
    expect(permiso.motivo).toMatch(/IA_TOPE_MENSUAL_USD/);
  });

  it('con el tope a cero no corta nunca, pero sigue contando', async () => {
    process.env.IA_TOPE_MENSUAL_USD = '0';
    await gasto.registrar({
      origen: 'chat', modelo: 'claude-sonnet-4-5', entrada: 1e7, salida: 1e7,
    });
    const e = await gasto.estado();
    expect(e.agotado).toBe(false);
    expect(e.gastado).toBeGreaterThan(100);
    expect((await gasto.compruebaAntesDeGastar()).permitido).toBe(true);
  });

  it('si no se puede leer la suma, no se corta, pero se dice', async () => {
    // Cortar el chat porque fallo una consulta seria cambiar un problema por
    // otro peor. Pero callarlo dejaria creer que el tope esta funcionando.
    fallaLaSuma = true;
    const e = await gasto.estado();
    expect(e.gastado).toBe(null);
    expect(e.agotado).toBe(false);
    expect(e.aviso).toMatch(/no se pudo/i);
    expect((await gasto.compruebaAntesDeGastar()).permitido).toBe(true);
  });
});

describe('apuntar cada llamada', () => {
  it('guarda tokens y coste', async () => {
    const r = await gasto.registrar({
      projectId: 3, userId: 7, origen: 'chat', modelo: 'claude-sonnet-4-5',
      entrada: 1000, salida: 500,
    });
    expect(r.apuntado).toBe(true);
    expect(filas).toHaveLength(1);
    const [projectId, userId, origen, modelo, entrada, salida] = filas[0];
    expect({ projectId, userId, origen, modelo, entrada, salida })
      .toEqual({ projectId: 3, userId: 7, origen: 'chat', modelo: 'claude-sonnet-4-5', entrada: 1000, salida: 500 });
  });

  it('una llamada que fallo tambien se apunta: los tokens de entrada ya se pagaron', async () => {
    const r = await gasto.registrar({
      origen: 'chat', modelo: 'claude-sonnet-4-5', entrada: 4000, salida: 0,
      fallo: 'Anthropic 529: overloaded',
    });
    expect(r.apuntado).toBe(true);
    expect(filas[0][10]).toMatch(/529/);
  });

  it('marca las que se cobraron a ojo', async () => {
    await gasto.registrar({ origen: 'chat', modelo: 'lo-que-sea', entrada: 100 });
    expect(filas[0][9]).toBe(true);
    expect((await gasto.estado()).inciertas).toBe(1);
  });

  it('si no se puede apuntar NO tumba la respuesta que el usuario ya tiene', async () => {
    fallaElInsert = true;
    await expect(gasto.registrar({
      origen: 'chat', modelo: 'claude-sonnet-4-5', entrada: 100,
    })).resolves.toMatchObject({ apuntado: false });
  });

  it('...pero se ve en el estado, porque el tope se queda ciego', async () => {
    // Un contador que no cuenta y calla es peor que no tener contador: el tope
    // parece puesto y va por debajo de la factura para siempre.
    fallaElInsert = true;
    await gasto.registrar({ origen: 'chat', modelo: 'claude-sonnet-4-5', entrada: 100 });
    await gasto.registrar({ origen: 'chat', modelo: 'claude-sonnet-4-5', entrada: 100 });
    const e = await gasto.estado();
    expect(e.fallosAlApuntar).toBe(2);
    expect(avisos.error).toHaveBeenCalled();
  });

  it('sin la tabla no intenta insertar, pero devuelve lo que habria costado', async () => {
    tablaExiste = false;
    const r = await gasto.registrar({
      origen: 'chat', modelo: 'claude-sonnet-4-5', entrada: 1e6,
    });
    expect(r.apuntado).toBe(false);
    expect(r.usd).toBe(3);
    expect(consultas.some((c) => c.sql.includes('INSERT'))).toBe(false);
  });
});
