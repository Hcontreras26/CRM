import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/*
  «Pregunta a tus datos» (#580): el menú la enseña solo con
  `reports_ia.generar`, pero la dirección /informes/preguntar se abría igual a
  mano y el error llegaba al preguntar. Ahora la ruta va dentro de ConPermiso.
*/

const sesion = vi.hoisted(() => ({ user: null, permissions: null }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => sesion }));

import ConPermiso from '@/shared/components/layout/ConPermiso';

const abrir = () => render(
  <MemoryRouter initialEntries={['/informes/preguntar']}>
    <Routes>
      <Route path="/informes" element={<p>Reportes</p>} />
      <Route path="/informes/preguntar" element={<ConPermiso permiso="reports_ia.generar" a="/informes"><p>Preguntar</p></ConPermiso>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => { sesion.user = null; sesion.permissions = null; });

describe('/informes/preguntar pide reports_ia.generar (#580)', () => {
  it('con el permiso se abre', () => {
    sesion.user = { id: 1, role: 'admin' };
    sesion.permissions = { 'reports_ia.generar': true };
    abrir();
    expect(screen.getByText('Preguntar')).toBeInTheDocument();
  });

  it('sin el permiso lleva a Reportes', () => {
    sesion.user = { id: 2, role: 'gestor' };
    sesion.permissions = { 'reports.view': true };
    abrir();
    expect(screen.getByText('Reportes')).toBeInTheDocument();
    expect(screen.queryByText('Preguntar')).toBeNull();
  });

  it('el superadmin entra siempre', () => {
    sesion.user = { id: 3, role: 'superadmin' };
    sesion.permissions = {};
    abrir();
    expect(screen.getByText('Preguntar')).toBeInTheDocument();
  });

  it('mientras no llega el mapa de permisos no echa a nadie', () => {
    sesion.user = { id: 1, role: 'admin' };
    abrir();
    expect(screen.queryByText('Reportes')).toBeNull();
    expect(screen.queryByText('Preguntar')).toBeNull();
  });
});
