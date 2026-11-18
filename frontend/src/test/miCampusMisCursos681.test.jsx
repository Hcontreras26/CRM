// «Mis cursos» dentro de «Mi campus» (Diego, 11/11: «que sea complemento dentro de Mi campus»).
// Dos pestañas: lo que hay que hacer en Moodle y sus cursos y comisiones. La dirección vieja
// /mis-cursos (la de los correos) lleva a la segunda.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

const miCampus = vi.fn();
const vacio = () => Promise.resolve({ success: true, data: [] });
vi.mock('@/modules/tutores/api/tutores.api', async (orig) => ({
  ...(await orig()),
  tutoresApi: {
    miCampus: (...a) => miCampus(...a),
    colaboraciones: vacio,
    comisiones: vacio,
    resumenComisiones: vacio,
  },
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 7, role: 'tutor', nombre: 'Tutora' } }) }));

const { default: MiCampusPage } = await import('@/modules/tutores/pages/MiCampusPage');

function DondeEstoy() {
  const l = useLocation();
  return <span data-testid="donde">{l.pathname}{l.search}</span>;
}
const pintar = (url) => render(
  <MemoryRouter initialEntries={[url]}>
    <Routes>
      <Route path="/mis-cursos" element={<Navigate to="/mis-cursos/campus?vista=cursos" replace />} />
      <Route path="/mis-cursos/campus" element={<><MiCampusPage /><DondeEstoy /></>} />
    </Routes>
  </MemoryRouter>,
);

beforeEach(() => {
  miCampus.mockReset();
  miCampus.mockResolvedValue({ success: true, data: { campus: [], sinConectar: [], pendientes: [], leidoAt: new Date().toISOString() } });
});

describe('Mi campus · «Mis cursos» como pestaña', () => {
  it('entra en «Por hacer en Moodle» y lee el campus', async () => {
    pintar('/mis-cursos/campus');
    expect(screen.getByRole('tab', { name: /Por hacer en Moodle/ })).toHaveAttribute('aria-selected', 'true');
    await waitFor(() => expect(miCampus).toHaveBeenCalled());
  });

  it('la pestaña «Mis cursos y comisiones» enseña sus cursos sin leer Moodle', async () => {
    pintar('/mis-cursos/campus?vista=cursos');
    expect(screen.getByRole('tab', { name: /Mis cursos y comisiones/ })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Mes')).toBeInTheDocument();
    expect(miCampus).not.toHaveBeenCalled();
    // Incrustada: sin su propia cabecera «Mis cursos».
    expect(screen.queryByRole('heading', { name: 'Mis cursos' })).toBeNull();
  });

  it('se cambia de pestaña y la dirección lo recuerda', async () => {
    pintar('/mis-cursos/campus');
    fireEvent.click(screen.getByRole('tab', { name: /Mis cursos y comisiones/ }));
    expect(screen.getByTestId('donde').textContent).toBe('/mis-cursos/campus?vista=cursos');
    fireEvent.click(screen.getByRole('tab', { name: /Por hacer en Moodle/ }));
    expect(screen.getByTestId('donde').textContent).toBe('/mis-cursos/campus');
  });

  it('el enlace viejo /mis-cursos lleva a la pestaña de sus cursos', async () => {
    pintar('/mis-cursos');
    expect(await screen.findByRole('tab', { name: /Mis cursos y comisiones/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('donde').textContent).toBe('/mis-cursos/campus?vista=cursos');
  });
});
