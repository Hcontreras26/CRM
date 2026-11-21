// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/*
  #941 (Diego, 19/11): en Ventas, fuera «Tutoriales» (una ventana con texto) y
  dentro «Ver recorrido», que señala paso a paso cada parte de la pantalla.

  Se pinta la pantalla de verdad, con datos en los que sale todo (empresa
  elegida, ventas por facturar, cuotas de ventas anteriores, meta, programas), y
  se recorre entero: cada paso encuentra su sitio y ninguno se salta.
*/

const { permisos, api } = vi.hoisted(() => ({ permisos: new Set(), api: { get: vi.fn() } }));

vi.mock('@/shared/api/client', () => ({ default: { get: (...a) => api.get(...a), post: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 41, role: 'gestor' } }) }));
vi.mock('@/contexts/ProjectContext', () => ({
  useProjectContext: () => ({
    activeProject: { id: 1, nombre: 'Campus de prueba' },
    activeIssuer: { id: 3, nombre: 'Empresa de prueba' }, activeIssuerId: 3,
    projects: [{ id: 1, nombre: 'Campus de prueba', sociedad_emisora_id: 3, sociedad_nombre: 'Empresa de prueba' }],
    switchProject: vi.fn(), switchIssuer: vi.fn(),
  }),
}));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: (k) => permisos.has(k) }) }));

const { default: IncomePage } = await import('@/modules/accounting/pages/IncomePage');
const { RECORRIDOS_COBROS, claveRecorrido } = await import('@/shared/lib/recorridosCobros');

const n0 = { n: 0, importe: 0 };
const RESPUESTAS = {
  '/conversions': {
    success: true,
    data: [{ id: 10, lead_id: 5, lead_nombre: 'Ana Pérez', producto_contratado: 'Máster', importe_total: 1000, importe_pagado: 500, fecha_conversion: '2026-11-10' }],
    pagination: { total: 1 },
    totales: {
      importe: 1000, pagado: 500, pendiente: 500, iva: 0,
      facturadas: 0, sinFactura: 1, noRequiereFactura: 0, pendientesDeFacturar: 1,
      facturasDeAntes: { n: 2, importe: 300 }, facturadoEnPeriodo: { n: 2, importe: 300 },
      cobrosDelPeriodo: { matricula: n0, cuotas: n0 },
      facturasPorClase: { venta: n0, cuota: { n: 2, importe: 300 }, parte: n0, suelta: n0 },
      porProyecto: [{ project_id: 1, nombre: 'Campus de prueba', ventas: { n: 1, importe: 1000 }, cuotas: { n: 2, importe: 300 } }],
      cobradoDeMas: n0,
    },
  },
  '/conversions/filas': {
    success: true,
    data: [{ tipo: 'venta', clave_id: 10, fecha: '2026-11-10', lead_id: 5, venta_id: 10, cliente: 'Ana Pérez', producto: 'Máster', total: 1000, pagado: 500 }],
    pagination: { total: 1 },
  },
  '/conversions/productos': { success: true, data: [] },
  '/ventas/my-stats': { success: true, data: { user_id: 41, ventas: 1, cobrado: 500, meta_ventas: 3, meta_facturacion: null, progreso_ventas_pct: 33 } },
  '/ventas/top-products': { success: true, data: [{ producto: 'Máster', ventas: 1, importe: 1000 }] },
};

const pintar = () => render(<MemoryRouter><IncomePage title="Ventas" /></MemoryRouter>);
const titulos = RECORRIDOS_COBROS.ventas.pasos.map((p) => p.titulo);

beforeEach(() => {
  localStorage.clear();
  permisos.clear();
  ['ventas.view', 'ventas.registrar', 'leads.assign', 'conversions.sin_gestora'].forEach((k) => permisos.add(k));
  api.get.mockReset();
  api.get.mockImplementation(async (url) => RESPUESTAS[url] ?? { success: true, data: null });
});
afterEach(() => cleanup());

describe('Ventas: «Ver recorrido» en vez de «Tutoriales» (#941)', () => {
  it('la cabecera ya no tiene «Tutoriales» y sí «Ver recorrido»', async () => {
    localStorage.setItem(claveRecorrido('ventas', 41), '1');
    pintar();
    expect(await screen.findByRole('button', { name: 'Ver recorrido: Ventas' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Tutoriales/ })).toBeNull();
  });

  it('la primera vez sale solo, cuando la pantalla ha cargado, y se recorre entero sin saltarse nada', async () => {
    pintar();
    await screen.findByText('Mi meta del mes', {}, { timeout: 5000 });
    await screen.findByRole('dialog', { name: 'Las ventas del periodo' }, { timeout: 3000 });
    expect(localStorage.getItem(claveRecorrido('ventas', 41))).toBe('1');

    const vistos = [];
    for (let i = 0; i < titulos.length + 2; i++) {
      vistos.push(document.getElementById('recorrido-titulo').textContent);
      const sig = screen.queryByRole('button', { name: /Siguiente/ });
      if (!sig) break;
      fireEvent.click(sig);
    }
    // Todos los pasos, en orden: ninguno se ha quedado sin su sitio en pantalla.
    expect(vistos).toEqual(titulos);
    expect(vistos).toEqual(expect.arrayContaining([
      'Los filtros', 'Cuotas facturadas', 'Ventas por facturar', 'Por proyecto', 'Ventas que esperan factura',
      'Facturas que no son ventas de ahora', 'Mi meta del mes', 'Programas más vendidos', 'Nueva venta',
    ]));
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('dialog', { name: /./ })).toBeNull();
  });

  it('«Atrás» vuelve al paso anterior y Escape lo cierra', async () => {
    localStorage.setItem(claveRecorrido('ventas', 41), '1');
    pintar();
    await screen.findByText('Mi meta del mes', {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: 'Ver recorrido: Ventas' }));
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    expect(screen.getByRole('dialog', { name: 'Los filtros' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Atrás/ }));
    expect(screen.getByRole('dialog', { name: 'Las ventas del periodo' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Las ventas del periodo' })).toBeNull();
  });

  it('lo señalado deja sitio a la barra fija de arriba al subir hasta ello (margen de scroll)', async () => {
    localStorage.setItem(claveRecorrido('ventas', 41), '1');
    pintar();
    await screen.findByText('Mi meta del mes', {}, { timeout: 5000 });
    const pantalla = document.querySelector('[data-recorrido="ventas-filtros"]').parentElement;
    expect(pantalla.className).toContain('[&_[data-recorrido]]:scroll-mt-40');
    expect(pantalla.className).toContain('max-sm:[&_[data-recorrido]]:scroll-mt-64');
    // Todos los sitios del recorrido cuelgan de ella (salvo «Nueva venta», que va en la barra).
    for (const n of ['ventas-tarjetas', 'ventas-por-proyecto', 'ventas-lista', 'mi-meta', 'programas-mas-vendidos']) {
      expect(pantalla.contains(document.querySelector(`[data-recorrido="${n}"]`)), n).toBe(true);
    }
  });

  it('el recorrido se pinta en el body, no dentro de la cabecera (en el PC se corría el ancho del menú)', async () => {
    localStorage.setItem(claveRecorrido('ventas', 41), '1');
    pintar();
    await screen.findByText('Mi meta del mes', {}, { timeout: 5000 });
    const boton = screen.getByRole('button', { name: 'Ver recorrido: Ventas' });
    fireEvent.click(boton);
    const cartel = screen.getByRole('dialog', { name: 'Las ventas del periodo' });
    // La capa del recorrido cuelga del body: ningún `backdrop-blur` ni `transform` de
    // la cabecera puede encerrar su `position: fixed`.
    expect(cartel.closest('.fixed.inset-0').parentElement).toBe(document.body);
    expect(boton.parentElement.contains(cartel)).toBe(false);
  });

  it('ya visto, no vuelve a salir solo', async () => {
    localStorage.setItem(claveRecorrido('ventas', 41), '1');
    pintar();
    await screen.findByText('Mi meta del mes', {}, { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 1200));
    expect(screen.queryByRole('dialog', { name: 'Las ventas del periodo' })).toBeNull();
  });

  it('sin permiso para ver ventas, ni botón ni recorrido', async () => {
    permisos.delete('ventas.view');
    pintar();
    await screen.findByText('Mi meta del mes', {}, { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 1200));
    expect(screen.queryByRole('button', { name: /Ver recorrido/ })).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Las ventas del periodo' })).toBeNull());
  });
});
