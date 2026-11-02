import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/*
  #79 punto 3: «el SubNav que le sale encima del contenido [de Ventas] hay que
  quitarlo de ahí y buscarle otro sitio». En Ventas ya no sale —lo que ofrecía
  está en el menú lateral—; en el resto de Finanzas se queda como estaba, también
  con las pestañas propias de un proyecto IA (#44).
*/
const proyecto = { activeProject: null };
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => proyecto }));

const { default: FinanzasLayout } = await import('@/modules/accounting/pages/FinanzasLayout');

function abrir(ruta) {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/finanzas" element={<FinanzasLayout />}>
          <Route path="*" element={<p>contenido</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('el submenú de Finanzas', () => {
  it('no sale encima de Ventas', () => {
    proyecto.activeProject = null;
    abrir('/finanzas/ventas');
    expect(screen.getByText('contenido')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Análisis de ventas/ })).toBeNull();
  });

  it('sigue en las demás pantallas de Finanzas', () => {
    proyecto.activeProject = null;
    abrir('/finanzas/ingresos');
    expect(screen.getByRole('link', { name: /Análisis de ventas/ })).toBeInTheDocument();
  });

  it('en un proyecto IA: sin submenú en Ventas, y en el resto solo sus pestañas', () => {
    proyecto.activeProject = { type: 'ia' };
    abrir('/finanzas/ventas');
    expect(screen.queryByRole('link', { name: /Cobros/ })).toBeNull();
    abrir('/finanzas/facturas');
    expect(screen.getByRole('link', { name: /Cobros/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Nóminas/ })).toBeNull();
  });
});
