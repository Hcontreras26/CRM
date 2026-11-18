import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router-dom';

/*
  La flechita de arriba a la izquierda de la ficha (prueba de Diana del 30/10,
  #203 B): al abrir un prospecto desde la lista de actividad de Reportes, la
  ficha tiene que poder devolver a Reportes, no siempre a Prospectos.
*/

vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: () => false }) }));

const { default: LeadHeaderCard } = await import('@/modules/leads/components/lead-detail/LeadHeaderCard');

const lead = { id: 179, nombre: 'Pedro Sanz', estado: 'nuevo', created_at: null, proyecto_nombre: 'Psiko Aprende' };
const Ficha = () => <LeadHeaderCard lead={lead} isAdmin={false} onReassign={() => {}} onBack={() => {}} />;

function Reportes() {
  const navigate = useNavigate();
  return <button type="button" onClick={() => navigate('/prospectos/179')}>Pedro Sanz en la lista</button>;
}

const rutas = (
  <Routes>
    <Route path="/informes" element={<Reportes />} />
    <Route path="/prospectos" element={<p>Lista de prospectos</p>} />
    <Route path="/prospectos/:id" element={<Ficha />} />
  </Routes>
);

describe('la flechita de la ficha', () => {
  it('desde Reportes, vuelve a Reportes', () => {
    render(<MemoryRouter initialEntries={['/informes']}>{rutas}</MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Pedro Sanz en la lista' }));
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la página anterior' }));
    expect(screen.getByRole('button', { name: 'Pedro Sanz en la lista' })).toBeInTheDocument();
  });

  it('con la ficha abierta directamente (sin página anterior), va a Prospectos', () => {
    render(<MemoryRouter initialEntries={['/prospectos/179']}>{rutas}</MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Volver a la página anterior' }));
    expect(screen.getByText('Lista de prospectos')).toBeInTheDocument();
  });
});
