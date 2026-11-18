import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/*
  #79 punto 3: la cabecera de Ventas, pintada de verdad.

  Sin el submenú de Finanzas, «Análisis de ventas» se alcanza desde el botón
  «Análisis» de la cabecera de Ventas, y «Sin formación» (#41) desde el suyo. Y el menú «Nueva venta», ahora en la
  cabecera, se cierra al pulsar fuera (en la cabecera, una capa `fixed` quedaba encerrada por el
  `backdrop-blur` del Topbar y el resto de la pantalla no lo cerraba).
*/

// La pantalla pide datos al arrancar: se quedan esperando, que para la
// cabecera da igual.
vi.mock('@/shared/api/client', () => ({ default: { get: () => new Promise(() => {}), post: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, role: 'admin' } }) }));
vi.mock('@/contexts/ProjectContext', () => ({
  useProjectContext: () => ({
    activeProject: { id: 1, nombre: 'Campus de prueba' }, activeIssuer: null, activeIssuerId: null,
    projects: [{ id: 1, nombre: 'Campus de prueba' }], switchProject: vi.fn(), switchIssuer: vi.fn(),
  }),
}));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: () => true }) }));

const { default: IncomePage } = await import('@/modules/accounting/pages/IncomePage');

function abrir(ruta) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/finanzas/ventas" element={<IncomePage title="Ventas" />} />
        <Route path="/finanzas/ingresos" element={<IncomePage />} />
        <Route path="/finanzas/ventas-analisis" element={<p>pantalla de análisis</p>} />
        <Route path="/finanzas/ventas-sin-formacion" element={<p>ventas sin formación</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('la cabecera de Ventas (#79 punto 3)', () => {
  it('en Ventas se ve «Análisis» y lleva a Análisis de ventas', () => {
    abrir('/finanzas/ventas');
    fireEvent.click(screen.getByRole('button', { name: 'Análisis' }));
    expect(screen.getByText('pantalla de análisis')).toBeInTheDocument();
  });

  it('en Ventas se ve «Sin formación» y lleva a esa pantalla (#41)', () => {
    abrir('/finanzas/ventas');
    fireEvent.click(screen.getByRole('button', { name: 'Sin formación' }));
    expect(screen.getByText('ventas sin formación')).toBeInTheDocument();
  });

  it('el menú «Nueva venta» se cierra al pulsar fuera', () => {
    abrir('/finanzas/ventas');
    fireEvent.click(screen.getByRole('button', { name: /Nueva venta/ }));
    expect(screen.getByRole('menu')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('y pulsar dentro del menú no lo cierra antes de tiempo', () => {
    abrir('/finanzas/ventas');
    fireEvent.click(screen.getByRole('button', { name: /Nueva venta/ }));
    fireEvent.mouseDown(screen.getByRole('menu'));
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });
});
