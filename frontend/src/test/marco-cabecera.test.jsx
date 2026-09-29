import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { CabeceraProvider, useCabecera } from '@/shared/components/layout/CabeceraContext';
import PageHeader from '@/shared/components/ui/PageHeader';

// Una barra de mentira: monta el hueco igual que lo monta Topbar.
function BarraFalsa() {
  const ctx = useCabecera();
  return <header data-testid="barra" ref={ctx?.registrarHueco} />;
}

function Marco({ children }) {
  return (
    <MemoryRouter>
      <CabeceraProvider>
        <BarraFalsa />
        <main data-testid="contenido">{children}</main>
      </CabeceraProvider>
    </MemoryRouter>
  );
}

describe('la cabecera de pantalla', () => {
  it('dentro del marco sale en la barra y NO en el contenido', () => {
    render(<Marco><PageHeader title="Prospectos" subtitle="Los tuyos" /></Marco>);

    const barra = screen.getByTestId('barra');
    const contenido = screen.getByTestId('contenido');

    expect(barra.textContent).toContain('Prospectos');
    expect(barra.textContent).toContain('Los tuyos');
    // Lo que se rompio al poner barra arriba: el titulo salia dos veces.
    expect(contenido.textContent).not.toContain('Prospectos');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('las acciones de la pantalla suben con el titulo', () => {
    render(
      <Marco>
        <PageHeader title="Ventas" actions={<button type="button">Nueva venta</button>} />
      </Marco>,
    );
    expect(screen.getByTestId('barra').textContent).toContain('Nueva venta');
  });

  it('fuera del marco se pinta donde esta', () => {
    // El acceso, poner contrasena y el formulario embebido no llevan barra.
    render(<MemoryRouter><PageHeader title="Inicia sesion" /></MemoryRouter>);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Inicia sesion');
  });

  it('no entra en bucle aunque las acciones sean distintas en cada pintada', () => {
    // El fallo que tuvo la primera version: guardar "actions" —que es JSX, un
    // objeto nuevo cada vez— en el estado del provider. Publicar provocaba una
    // pintada, que creaba otro objeto, que se volvia a publicar. Sin fin.
    let pintadas = 0;
    function Pantalla({ n }) {
      pintadas += 1;
      return <PageHeader title="Prospectos" actions={<button type="button">Nuevo {n}</button>} />;
    }
    const { rerender } = render(<Marco><Pantalla n={0} /></Marco>);
    const trasLaPrimera = pintadas;
    rerender(<Marco><Pantalla n={1} /></Marco>);

    // Cada pintada trae un "actions" nuevo. Si eso disparara otra pintada, esto
    // no seria un numero pequeno: seria un desbordamiento de pila.
    expect(trasLaPrimera).toBeLessThan(5);
    expect(pintadas).toBeLessThan(10);
    expect(screen.getByTestId('barra').textContent).toContain('Nuevo 1');
  });

  it('al salir de la pantalla la barra deja de darla por ocupada', () => {
    function Sonda() {
      const ctx = useCabecera();
      return <span data-testid="ocupado">{String(ctx?.ocupado)}</span>;
    }
    function Con({ hay }) {
      return (
        <MemoryRouter>
          <CabeceraProvider>
            <BarraFalsa />
            <Sonda />
            {hay && <PageHeader title="Prospectos" />}
          </CabeceraProvider>
        </MemoryRouter>
      );
    }
    const { rerender } = render(<Con hay />);
    expect(screen.getByTestId('ocupado')).toHaveTextContent('true');
    // Si no se limpiara, la pantalla siguiente heredaria titulo y botones.
    rerender(<Con hay={false} />);
    expect(screen.getByTestId('ocupado')).toHaveTextContent('false');
  });
});
