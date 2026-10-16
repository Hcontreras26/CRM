import { describe, it, expect, vi, beforeEach } from 'vitest';

// Diego, 12/10, en el panel de Diplomas: «poner siempre para editar los módulos que
// aparecerán, o sincronizar a un producto». Los módulos salen de la página del curso:
// cada campus los marca distinto, y aquí va un trozo real de cada uno (12/10).

const consultas = [];
let producto = { id: 7, nombre: 'Curso X', url_info: 'https://iseih.com/cursos/x/' };
const cliente = { query: vi.fn(async (sql, p) => { consultas.push({ sql, p }); return { rows: [] }; }), release: vi.fn() };
vi.mock('../src/shared/config/db.js', () => ({
  query: vi.fn(async (sql) => (/FROM products WHERE id = \$1/.test(sql) ? { rows: producto ? [producto] : [] } : { rows: [] })),
  getClient: vi.fn(async () => cliente),
}));
vi.mock('../src/modules/woocommerce/html-scraper.js', () => ({ fetchHtmlWithRetry: vi.fn() }));

const { extraerModulosDeHtml, sincronizarTemario } = await import('../src/modules/products/temario.js');

beforeEach(() => { consultas.length = 0; producto = { id: 7, nombre: 'Curso X', url_info: 'https://iseih.com/cursos/x/' }; });

const MUESTRAS = {
  'ISEIH (strong y punto)': '<p><strong>Módulo 1. Envejecimiento cognitivo normal, deterioro cognitivo leve y demencia</strong></p><ul><li>Uno</li></ul><p><strong>Módulo 2. Dominios cognitivos y su traducción a tareas de taller</strong></p>',
  'Psiko (h4 y dos puntos)': '<h4 class="x">Módulo 1: Estructura Estándar del Informe Psicopedagógico</h4><p>…</p><h4 class="x">Módulo 2: Redacción de la Sección de Datos Personales</h4>',
  'Fono (h3)': '<h3>Módulo 1: Psicología de la Identidad de Género y la Voz</h3><h3>Módulo 2: Acompañamiento Psicológico y Vocal en la Recuperación</h3>',
  'ISSLOGG (span)': '<button><span>Módulo 1: Limitaciones del forecast puramente estadístico</span></button><button><span>Módulo 2: Sesgo humano en la previsión de demanda</span></button>',
  'ISECD (raya y cero delante)': '<h3>Módulo 01 — Fundamentos del pentesting web</h3><h3>Módulo 02 &mdash; Metodologías profesionales</h3>',
  'ISEF (summary)': '<details><summary>Módulo 1: El cementerio histórico como patrimonio cultural: valor y protección</summary></details><details><summary>Módulo 2: Marco legal de la protección del patrimonio funerario en España</summary></details>',
};

describe('los módulos de la página del curso, en cada campus', () => {
  for (const [campus, html] of Object.entries(MUESTRAS)) {
    it(campus, () => {
      const m = extraerModulosDeHtml(html);
      expect(m).toHaveLength(2);
      expect(m.map((x) => x.n)).toEqual([1, 2]);
      expect(m[0].titulo.length).toBeGreaterThan(10);
      expect(m[0].titulo).not.toMatch(/^M[oó]dulo/);
    });
  }
  it('el título conserva sus dos puntos internos (ISEF) y decodifica las entidades', () => {
    expect(extraerModulosDeHtml(MUESTRAS['ISEF (summary)'])[0].titulo).toBe('El cementerio histórico como patrimonio cultural: valor y protección');
    expect(extraerModulosDeHtml('<h3>M&oacute;dulo 1: Gesti&oacute;n &amp; control</h3><h3>Módulo 2: Otro módulo</h3>')[0].titulo).toBe('Gestión & control');
  });
  it('las páginas que repiten el temario (móvil y escritorio) no duplican módulos', () => {
    const html = MUESTRAS['Fono (h3)'] + MUESTRAS['Fono (h3)'];
    expect(extraerModulosDeHtml(html)).toHaveLength(2);
  });
  it('una mención suelta no es un temario, y sin el módulo 1 tampoco', () => {
    expect(extraerModulosDeHtml('<p>Módulo 3: lo verás más adelante</p>')).toEqual([]);
    expect(extraerModulosDeHtml('<h3>Módulo 2: A</h3><h3>Módulo 3: B</h3>')).toEqual([]);
    expect(extraerModulosDeHtml('<p>Un texto sin temario</p>')).toEqual([]);
  });
  it('si hay un salto, se queda con los seguidos desde el 1', () => {
    expect(extraerModulosDeHtml('<h3>Módulo 1: A uno</h3><h3>Módulo 2: B dos</h3><h3>Módulo 5: E cinco</h3>').map((x) => x.n)).toEqual([1, 2]);
  });
});

describe('sincronizar guarda los módulos en el catálogo', () => {
  it('borra los que hubiera y escribe los nuevos, en una transacción, y actualiza num_modulos', async () => {
    const r = await sincronizarTemario(7, { leer: async () => MUESTRAS['Psiko (h4 y dos puntos)'] });
    expect(r.modulos).toHaveLength(2);
    expect(r.motivo).toBeNull();
    const sqls = consultas.map((c) => c.sql);
    expect(sqls[0]).toBe('BEGIN');
    expect(sqls).toContain('DELETE FROM product_modules WHERE product_id = $1');
    expect(sqls.filter((s) => s.startsWith('INSERT INTO product_modules'))).toHaveLength(2);
    expect(sqls.some((s) => s.startsWith('UPDATE products SET num_modulos'))).toBe(true);
    expect(sqls.at(-1)).toBe('COMMIT');
  });
  it('si la página no los separa, NO borra lo que hubiera y dice por qué', async () => {
    const r = await sincronizarTemario(7, { leer: async () => '<p>Sin temario</p>' });
    expect(r.modulos).toEqual([]);
    expect(r.motivo).toMatch(/escribe los módulos a mano/);
    expect(consultas).toHaveLength(0);
  });
  it('si la página no abre, no rompe: lo dice', async () => {
    const r = await sincronizarTemario(7, { leer: async () => { throw new Error('HTTP 503'); } });
    expect(r.modulos).toEqual([]);
    expect(r.motivo).toMatch(/No se pudo abrir/);
  });
  it('sin dirección de la página, lo dice', async () => {
    producto = { id: 7, nombre: 'Curso X', url_info: null };
    expect((await sincronizarTemario(7)).motivo).toMatch(/no tiene la dirección/);
  });
  it('una formación que no existe: 404', async () => {
    producto = null;
    await expect(sincronizarTemario(99)).rejects.toMatchObject({ statusCode: 404 });
  });
});
