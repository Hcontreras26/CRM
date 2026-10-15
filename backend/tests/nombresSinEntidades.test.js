import { describe, it, expect, vi, beforeEach } from 'vitest';

/*
  Los nombres de curso entran con la letra, no con la entidad HTML (#234).

  En el filtro de cursos de Ingresos salía «Coaching &amp; Liderazgo».
  WooCommerce y la API de WordPress devuelven los nombres ya codificados para
  HTML, y el CRM los guardaba tal cual. Se arregla al entrar: en el import de
  WooCommerce (productos y categorías) y en el de los Conectores.

  Sin base de datos: `query` es un doble que apunta lo que se le manda.
*/

vi.mock('../src/shared/config/db.js', () => ({
  getClient: vi.fn(),
  query: vi.fn(async () => ({ rows: [], rowCount: 0 })),
}));

const { query } = await import('../src/shared/config/db.js');
const { decodificarEntidades } = await import('../src/shared/utils/entidadesHtml.js');
const wc = await import('../src/modules/woocommerce/wc.model.js');

beforeEach(() => {
  query.mockReset();
  query.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
});

describe('decodificarEntidades', () => {
  it('el caso del #234: «&amp;» vuelve a ser «&»', () => {
    expect(decodificarEntidades('Máster en Coaching &amp; Liderazgo')).toBe('Máster en Coaching & Liderazgo');
  });

  it('las numéricas que pone WordPress: guiones y comillas', () => {
    expect(decodificarEntidades('Curso &#8211; Online')).toBe('Curso – Online');
    expect(decodificarEntidades('El curso de l&#8217;Institut')).toBe('El curso de l’Institut');
    expect(decodificarEntidades('&#x26; hex')).toBe('& hex');
  });

  it('las acentuadas con nombre, respetando mayúsculas', () => {
    expect(decodificarEntidades('Psicolog&iacute;a &Aacute;rea Ni&ntilde;os')).toBe('Psicología Área Niños');
  });

  it('una sola pasada: «&amp;lt;» da «&lt;», no «<»', () => {
    expect(decodificarEntidades('a &amp;lt; b')).toBe('a &lt; b');
  });

  it('el espacio duro pasa a espacio normal', () => {
    expect(decodificarEntidades('Curso&nbsp;de&#160;verano')).toBe('Curso de verano');
  });

  it('lo que no es una entidad conocida se deja como estaba', () => {
    expect(decodificarEntidades('AT&T y &inventada; y &#0;')).toBe('AT&T y &inventada; y &#0;');
    expect(decodificarEntidades('Sin nada raro')).toBe('Sin nada raro');
  });

  it('lo que no es texto vuelve igual', () => {
    expect(decodificarEntidades(null)).toBeNull();
    expect(decodificarEntidades(undefined)).toBeUndefined();
    expect(decodificarEntidades(42)).toBe(42);
  });
});

describe('el import de WooCommerce guarda el nombre limpio', () => {
  it('un producto nuevo entra con «&», no con «&amp;»', async () => {
    query.mockImplementation(async (sql) => {
      if (/INSERT INTO products/.test(sql)) return { rows: [{ id: 9 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await wc.upsertProductFromWc({
      projectId: 1, wcId: 55, data: { nombre: 'Coaching &amp; Liderazgo', precio: '100' },
    });
    const insert = query.mock.calls.find(([sql]) => /INSERT INTO products/.test(sql));
    expect(insert).toBeTruthy();
    expect(insert[1]).toContain('Coaching & Liderazgo');
    expect(insert[1]).not.toContain('Coaching &amp; Liderazgo');
  });

  it('si el guardado de antes lleva la entidad, lo encuentra y no lo duplica', async () => {
    // Sin wc_product_id que lo encuentre, se busca por nombre: primero el
    // limpio y, si no aparece, el de antes del arreglo.
    query.mockImplementation(async (sql, params) => {
      if (/LOWER\(TRIM\(nombre\)\)/.test(sql) && params?.[1] === 'Coaching &amp; Liderazgo') {
        return { rows: [{ id: 7 }], rowCount: 1 };
      }
      if (/UPDATE products/.test(sql)) return { rows: [{ id: 7 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await wc.upsertProductFromWc({
      projectId: 1, wcId: 55, data: { nombre: 'Coaching &amp; Liderazgo', precio: '100' },
    });
    expect(query.mock.calls.some(([sql]) => /INSERT INTO products/.test(sql))).toBe(false);
    const update = query.mock.calls.find(([sql]) => /UPDATE products/.test(sql));
    expect(update[1]).toContain('Coaching & Liderazgo');
  });

  it('una categoría también entra con la letra', async () => {
    query.mockImplementation(async (sql) => {
      if (/INSERT INTO product_categories/.test(sql)) return { rows: [{ id: 3 }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    await wc.upsertCategoryByWcId(1, 12, 'Salud &amp; Bienestar', null);
    const insert = query.mock.calls.find(([sql]) => /INSERT INTO product_categories/.test(sql));
    expect(insert[1]).toContain('Salud & Bienestar');
  });
});
