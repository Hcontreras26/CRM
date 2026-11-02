import { describe, it, expect } from 'vitest';
import { campusAlAbrir } from '@/shared/components/layout/CommandPalette';

// Revisión del 02/11 del buscador de Hugo (#591): con «Todos» o con una empresa
// en la cabecera, abrir un producto llevaba al muro «Elige un campus»
// (`/productos/:id` pide un campus); una venta o una factura, también con
// «Todos» (con una empresa sí abren: `CON_SOCIEDAD_OK`). Antes de navegar, el
// buscador se pone en el campus del resultado.
const TODOS = { unCampus: false, todos: true };
const EMPRESA = { unCampus: false, todos: false };
const CAMPUS = { unCampus: true, todos: false };

describe('el campus antes de abrir un resultado', () => {
  it('un producto, con «Todos» o con una empresa, abre en su campus', () => {
    expect(campusAlAbrir({ type: 'product', projectId: '4' }, TODOS)).toBe(4);
    expect(campusAlAbrir({ type: 'product', projectId: 4 }, EMPRESA)).toBe(4);
  });

  it('una venta o una factura, solo con «Todos»', () => {
    expect(campusAlAbrir({ type: 'venta', projectId: 2 }, TODOS)).toBe(2);
    expect(campusAlAbrir({ type: 'factura', projectId: 2 }, TODOS)).toBe(2);
    expect(campusAlAbrir({ type: 'venta', projectId: 2 }, EMPRESA)).toBeNull();
  });

  it('con un campus arriba no se cambia nada', () => {
    expect(campusAlAbrir({ type: 'product', projectId: 4 }, CAMPUS)).toBeNull();
  });

  it('las personas abren con cualquier cabecera', () => {
    expect(campusAlAbrir({ type: 'lead', projectId: 4 }, TODOS)).toBeNull();
  });

  it('un reciente recuerda qué era y de qué campus', () => {
    expect(campusAlAbrir({ type: 'recent', tipo: 'product', projectId: 7 }, TODOS)).toBe(7);
    expect(campusAlAbrir({ type: 'recent', tipo: 'section' }, TODOS)).toBeNull();
  });
});
