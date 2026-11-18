import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/*
  Reportes es de quien tiene `reports.view` (prueba de Diana del 30/10, #203 B).
  Una gestora que entraba en /informes por la dirección veía la página en blanco
  y dos avisos de «No tienes permiso»: ahora va al Dashboard, sin pedir nada.
*/

const get = vi.fn();
vi.mock('@/shared/api/client', () => ({ default: { get: (...a) => get(...a) } }));
let permisos = null;
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 4, role: 'gestor' }, permissions: permisos }),
}));

const { default: ReportsPage } = await import('@/modules/reports/pages/ReportsPage');

const pintar = () => render(
  <MemoryRouter initialEntries={['/informes']}>
    <Routes>
      <Route path="/" element={<p>Dashboard</p>} />
      <Route path="/informes" element={<ReportsPage />} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => { get.mockReset(); });

describe('Reportes, solo con «reports.view»', () => {
  it('una gestora sin el permiso va al Dashboard, sin pedir el informe', () => {
    permisos = { 'reports.mis_informes': true };
    pintar();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  it('mientras no ha llegado el mapa de permisos, ni se pinta ni se pide nada', () => {
    permisos = null;
    const { container } = pintar();
    expect(container).toBeEmptyDOMElement();
    expect(get).not.toHaveBeenCalled();
  });
});
