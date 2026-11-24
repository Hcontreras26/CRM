import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'node:fs';
import path from 'node:path';

/**
 * CRM#534, parte 5 · El Dashboard como «Hoy».
 *
 *   · Arriba, las cifras clave con su nombre y su recuento (las de octubre de
 *     Manuel: 18.048 € cobrados · 82 cobros, 17.038 € facturados · 77 ventas,
 *     43 ventas nuevas) y dos alertas que llevan a Prospectos filtrado.
 *   · Debajo, la cola del día. Lo demás, plegado.
 *   · «Productos vendidos»: top 10 y «Ver todos».
 */

vi.mock('@/contexts/ProjectContext', () => ({
  useProjectContext: () => ({ activeProject: { id: 1 }, activeIssuerId: null }),
}));

const navegar = vi.hoisted(() => vi.fn());
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useNavigate: () => navegar }));

const respuestas = vi.hoisted(() => ({ puesto: null, facturado: null, top: null }));
vi.mock('@/shared/api/client', () => ({
  default: {
    get: vi.fn(async (url) => {
      if (url.startsWith('/informes/mi-puesto')) return { success: true, data: respuestas.puesto };
      if (url.startsWith('/ventas/facturado')) return { success: true, data: respuestas.facturado };
      if (url.startsWith('/ventas/top-products')) return { success: true, data: respuestas.top };
      return { success: true, data: null };
    }),
  },
}));

const { default: CifrasDeHoy } = await import('@/shared/components/dashboard/CifrasDeHoy');
const { default: CursosVendidosCard } = await import('@/modules/sales/components/CursosVendidosCard');

const texto = (el) => (el.textContent || '').replace(/\s+/g, ' ');

beforeEach(() => {
  navegar.mockReset();
  respuestas.puesto = {
    tabla: [],
    total: { leads: 250, ventas: 43, vendido: 24184, cobrado: 18047.82, cobros: 82 },
  };
  respuestas.facturado = {
    total: { facturado: 17037.82, ventas: 77 },
    gestoras: [], sin_gestora: { facturado: 0, ventas: 0 },
    productos: Array.from({ length: 14 }, (_, i) => ({ product_id: i + 1, producto: `Curso ${i + 1}`, ventas: 14 - i, facturado: 100 })),
  };
});

const pintar = (props = {}) => render(
  <MemoryRouter>
    <CifrasDeHoy stats={{ sin_asignar: 566 }} today={{ nuevos_mes: 310, nuevos_hoy: 12, inactivos: 1726 }} {...props} />
  </MemoryRouter>,
);

describe('las cifras de hoy', () => {
  it('cada importe con su recuento, como en «El equipo este mes»', async () => {
    const { container } = pintar();
    await waitFor(() => expect(texto(container)).toMatch(/Facturado/));
    const t = texto(container);
    expect(t).toMatch(/Cobrado\s*18\.048\s*€\s*82 cobros · este mes/);
    expect(t).toMatch(/Facturado\s*17\.038\s*€\s*77 ventas facturadas · este mes/);
    expect(t).toMatch(/Ventas nuevas\s*43\s*24\.184\s*€ vendidos · este mes/);
    expect(t).toMatch(/Prospectos nuevos\s*310\s*este mes · 12 hoy/);
  });

  it('las dos alertas llevan a Prospectos con su filtro', async () => {
    pintar();
    fireEvent.click(screen.getByText('sin gestora').closest('button'));
    expect(navegar).toHaveBeenCalledWith('/prospectos?qf=sin-gestora');
    fireEvent.click(screen.getByText('sin actividad').closest('button'));
    expect(navegar).toHaveBeenCalledWith('/prospectos?qf=sin-actividad');
    expect(texto(screen.getByText('sin gestora').closest('button'))).toMatch(/566/);
    // En español, Intl no separa los millares con cuatro cifras: «1726».
    expect(texto(screen.getByText('sin actividad').closest('button'))).toMatch(/1726/);
  });

  it('una gestora (sin tabla) ve lo suyo y sin la tarjeta Facturado', async () => {
    respuestas.puesto = { tabla: null, ventas: 5, vendido: 900, cobrado: 1200, cobros: 6 };
    const { container } = pintar();
    await waitFor(() => expect(texto(container)).toMatch(/Cobrado/));
    expect(texto(container)).toMatch(/1200\s*€\s*6 cobros/);
    expect(texto(container)).not.toMatch(/Facturado/);
  });
});

describe('Productos vendidos: top 10 y «Ver todos»', () => {
  it('enseña 10 y despliega el resto', async () => {
    const { container } = render(<CursosVendidosCard projectId={1} medida="facturado" />);
    await waitFor(() => expect(screen.getByText('Curso 1')).toBeTruthy());
    expect(container.querySelectorAll('li p.text-sm').length).toBe(10);
    fireEvent.click(screen.getByText('Ver todos (14)'));
    expect(container.querySelectorAll('li p.text-sm').length).toBe(14);
    expect(screen.getByText('Ver solo los 10 primeros')).toBeTruthy();
  });
});

describe('el Dashboard: cifras, cola y lo demás en plegables abiertos', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'shared/pages/DashboardPage.jsx'), 'utf8');
  const devuelve = src.slice(src.indexOf('<AvisoHuecosFacturas'));

  it('arriba las cifras y la cola; después, los plegables', () => {
    const cifras = devuelve.indexOf('<CifrasDeHoy');
    const cola = devuelve.indexOf('<ParaHoyYManana');
    const primerPlegable = devuelve.indexOf('<BloquePlegable');
    expect(cifras).toBeGreaterThan(0);
    expect(cola).toBeGreaterThan(cifras);
    expect(primerPlegable).toBeGreaterThan(cola);
  });

  it('el ranking («Cómo voy») arriba y a la vista, fuera de los plegables, como en la 2.9.8 (Diego, 24/11)', () => {
    const comoVoy = devuelve.indexOf('<ComoVoy');
    expect(comoVoy).toBeGreaterThan(0);
    expect(comoVoy).toBeLessThan(devuelve.indexOf('<BloquePlegable'));
    expect(devuelve).not.toContain('clave="dashboard-equipo"');
  });

  it('los productos y el embudo, plegables y ABIERTOS de entrada (Diego, 24/11)', () => {
    for (const [clave, dentro] of [['dashboard-productos', '<CursosVendidosCard'], ['dashboard-embudo', '<ConversionFunnel']]) {
      const a = devuelve.indexOf(`clave="${clave}"`);
      const b = devuelve.indexOf('</BloquePlegable>', a);
      expect(a, clave).toBeGreaterThan(0);
      expect(devuelve.slice(a, b), clave).toContain(dentro);
      expect(devuelve.slice(a, devuelve.indexOf('>', a)), clave).not.toContain('abiertoPorDefecto={false}');
    }
  });

  it('el título es el día', () => {
    expect(src).toMatch(/title=\{`Hoy, \$\{todayDate\}`\}/);
  });
});
