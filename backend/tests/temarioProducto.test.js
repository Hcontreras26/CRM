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

const { extraerModulosDeHtml, sincronizarTemario, paginasDelCurso } = await import('../src/modules/products/temario.js');

beforeEach(() => { consultas.length = 0; producto = { id: 7, nombre: 'Curso X', url_info: 'https://iseih.com/cursos/x/' }; });

const MUESTRAS = {
  'ISEIH (strong y punto)': '<p><strong>Módulo 1. Envejecimiento cognitivo normal, deterioro cognitivo leve y demencia</strong></p><ul><li>Uno</li></ul><p><strong>Módulo 2. Dominios cognitivos y su traducción a tareas de taller</strong></p>',
  'Psiko (h4 y dos puntos)': '<h4 class="x">Módulo 1: Estructura Estándar del Informe Psicopedagógico</h4><p>…</p><h4 class="x">Módulo 2: Redacción de la Sección de Datos Personales</h4>',
  'Fono (h3)': '<h3>Módulo 1: Psicología de la Identidad de Género y la Voz</h3><h3>Módulo 2: Acompañamiento Psicológico y Vocal en la Recuperación</h3>',
  'ISSLOGG (span)': '<button><span>Módulo 1: Limitaciones del forecast puramente estadístico</span></button><button><span>Módulo 2: Sesgo humano en la previsión de demanda</span></button>',
  'ISECD (raya y cero delante)': '<h3>Módulo 01 — Fundamentos del pentesting web</h3><h3>Módulo 02 &mdash; Metodologías profesionales</h3>',
  'ISEF (summary)': '<details><summary>Módulo 1: El cementerio histórico como patrimonio cultural: valor y protección</summary></details><details><summary>Módulo 2: Marco legal de la protección del patrimonio funerario en España</summary></details>',
  // 19/10: el icono del acordeón va delante, dentro del botón, y en mayúsculas.
  'ISAEG (icono delante y mayúsculas)': '<div class="pe-accordion"> <button class="pe-header" onclick="peToggle(\'modulo-1\', this)" aria-expanded="false"> <span class="pe-icon">+</span> MÓDULO 1: EL PACIENTE MAYOR Y LA COMPLEJIDAD GERIÁTRICA </button> <div class="pe-body" id="modulo-1" style="display:none"></div></div><div class="pe-accordion"> <button class="pe-header"> <span class="pe-icon">+</span> MÓDULO 2: VALORACIÓN GERIÁTRICA INTEGRAL: METODOLOGÍA Y HERRAMIENTAS </button></div>',
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
  it('con el icono del acordeón delante (ISAEG) el título sale entero y sin el icono', () => {
    expect(extraerModulosDeHtml(MUESTRAS['ISAEG (icono delante y mayúsculas)']).map((x) => x.titulo)).toEqual([
      'EL PACIENTE MAYOR Y LA COMPLEJIDAD GERIÁTRICA',
      'VALORACIÓN GERIÁTRICA INTEGRAL: METODOLOGÍA Y HERRAMIENTAS',
    ]);
    // Un elemento con texto largo delante no es un icono: no cuela una mención suelta.
    expect(extraerModulosDeHtml('<p><span>Ver el detalle</span> Módulo 1: A uno</p><p><span>Ver</span> Módulo 2: B dos</p>')).toEqual([]);
  });
  it('el título en el elemento siguiente (Psiko: «Módulo 1:» en negrita y el título debajo)', () => {
    const html = '<p><strong>Módulo 1:</strong></p><ul><li><strong>Introducción a la Sexología Clínica</strong><ul><li>Conceptos</li></ul></li></ul>'
      + '<p><strong>Módulo 2:</strong></p><ul><li><strong>Evaluación y diagnóstico sexológico</strong></li></ul>';
    expect(extraerModulosDeHtml(html).map((x) => x.titulo)).toEqual(['Introducción a la Sexología Clínica', 'Evaluación y diagnóstico sexológico']);
  });
  it('«TEMA N» cuando la página no dice «Módulo» (ISEIE)', () => {
    const html = '<h3 class="e-n-accordion-item-title-text"> TEMA 1: INTRODUCCIÓN A LA MEDICINA ESTÉTICA </h3><h3 class="e-n-accordion-item-title-text"> TEMA 2: ANATOMÍA FACIAL </h3>';
    expect(extraerModulosDeHtml(html).map((x) => x.titulo)).toEqual(['INTRODUCCIÓN A LA MEDICINA ESTÉTICA', 'ANATOMÍA FACIAL']);
    // Si hay «Módulo N», manda: un «Tema 1» suelto dentro de un módulo no lo cambia.
    expect(extraerModulosDeHtml(MUESTRAS['Fono (h3)'] + '<h4>Tema 1: Repaso</h4><h4>Tema 2: Otro</h4>')).toHaveLength(2);
    expect(extraerModulosDeHtml(MUESTRAS['Fono (h3)'] + '<h4>Tema 1: Repaso</h4><h4>Tema 2: Otro</h4>')[0].titulo).toMatch(/Psicología/);
  });
  it('un temario largo con un número mal puesto en la web (ISEIE: del 1 al 3) sale entero, renumerado', () => {
    const h = (n, t) => `<h3 class="e-n-accordion-item-title-text"> MÓDULO ${n}: ${t} </h3>`;
    const html = h(1, 'FUNDAMENTOS Y EXAMEN DERMATOLÓGICO') + h(3, 'ALERGIAS') + h(4, 'PARASITOSIS') + h(5, 'ENDOCRINAS') + h(6, 'TUMORES');
    const m = extraerModulosDeHtml(html);
    expect(m.map((x) => x.n)).toEqual([1, 2, 3, 4, 5]);
    expect(m[1].titulo).toBe('ALERGIAS');
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
  it('Academia IA: la ficha de la tienda no trae temario y se coge el de la página del curso', async () => {
    producto = { id: 8473, nombre: 'Curso de Benchmarking', url_info: 'https://academiaia.ai/product/curso-de-benchmarking-automatizado-con-inteligencia-artificial-16412/' };
    const pedidas = [];
    const r = await sincronizarTemario(8473, {
      leer: async (url) => {
        pedidas.push(url);
        if (url.includes('/product/')) return '<p>La ficha de la tienda, sin temario</p>';
        if (url.includes('/expertos/')) return MUESTRAS['Fono (h3)'];
        throw new Error('HTTP 404');
      },
    });
    expect(r.modulos).toHaveLength(2);
    expect(r.fuente).toBe('https://academiaia.ai/expertos/curso-de-benchmarking-automatizado-con-inteligencia-artificial/');
    // Primero la ficha, luego los niveles en orden hasta dar con él.
    expect(pedidas).toEqual([
      producto.url_info,
      'https://academiaia.ai/principiantes/curso-de-benchmarking-automatizado-con-inteligencia-artificial/',
      'https://academiaia.ai/avanzado/curso-de-benchmarking-automatizado-con-inteligencia-artificial/',
      'https://academiaia.ai/expertos/curso-de-benchmarking-automatizado-con-inteligencia-artificial/',
    ]);
  });
  it('las páginas del curso solo se buscan para fichas de la tienda de Academia IA', () => {
    expect(paginasDelCurso('https://academiaia.ai/product/master-en-ia-123/')).toEqual([
      'https://academiaia.ai/principiantes/master-en-ia/', 'https://academiaia.ai/avanzado/master-en-ia/', 'https://academiaia.ai/expertos/master-en-ia/',
    ]);
    expect(paginasDelCurso('https://psikoaprende.com/curso-de-mindfulness-2978/')).toEqual([]);
    expect(paginasDelCurso('https://academiaia.ai/avanzado/diplomado-x/')).toEqual([]);
    expect(paginasDelCurso(null)).toEqual([]);
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
