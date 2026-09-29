import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mocks ANTES de import del componente
vi.mock('@/shared/components/ui/portal', () => ({
  default: ({ children }) => children,
}));

vi.mock('@/shared/hooks/useDialogA11y', () => ({
  useEscapeKey: () => {},
}));

const productsState = { products: [] };
vi.mock('@/modules/products/hooks/useProducts', () => ({
  useProducts: () => productsState,
}));

const createMock = vi.fn();
vi.mock('@/modules/conversions/api/conversions.api', () => ({
  conversionsApi: {
    create: (...args) => createMock(...args),
  },
}));

const toastMock = vi.fn();
vi.mock('@/shared/hooks/useToast', () => ({
  toast: (...args) => toastMock(...args),
}));

import ConversionDialog from '@/modules/conversions/components/ConversionDialog';

const baseLead = { id: 99, nombre: 'Ana Test' };

beforeEach(() => {
  productsState.products = [];
  createMock.mockReset();
  createMock.mockResolvedValue({ success: true, data: { id: 1 } });
  toastMock.mockReset();
});

describe('ConversionDialog — render base', () => {
  it('no renderiza nada cuando open=false', () => {
    render(<ConversionDialog open={false} onClose={vi.fn()} lead={baseLead} projectId={1} />);
    expect(screen.queryByText(/Registrar Conversion/i)).not.toBeInTheDocument();
  });

  it('renderiza con nombre del lead en subtítulo', () => {
    render(<ConversionDialog open onClose={vi.fn()} lead={baseLead} projectId={1} />);
    expect(screen.getByText(/Lead: Ana Test/i)).toBeInTheDocument();
  });

  it('campo "Fecha compromiso" oculto si metodo_pago no es fraccionado', () => {
    render(<ConversionDialog open onClose={vi.fn()} lead={baseLead} projectId={1} />);
    expect(screen.queryByText(/Fecha compromiso de pago pendiente/i)).not.toBeInTheDocument();
  });

  it('campo "Fecha compromiso" se muestra si metodo_pago = fraccionado', async () => {
    render(<ConversionDialog open onClose={vi.fn()} lead={baseLead} projectId={1} />);
    // Sin productos solo hay un combobox: "Metodo de pago"
    const metodoTrigger = screen.getByRole('combobox', { name: /Método de pago/i });
    fireEvent.click(metodoTrigger);
    fireEvent.mouseDown(await screen.findByRole('option', { name: 'Fraccionado' }));
    expect(await screen.findByText(/Fecha compromiso de pago pendiente/i)).toBeInTheDocument();
  });
});

/**
 * Rellenar el dialogo como lo hace una persona, no por posicion.
 *
 * Estas pruebas cogian los campos con `querySelectorAll('input[type=number]')[0]`
 * y `[1]`, dando por hecho que eran el total y el pagado «segun el grid del
 * JSX». Cuando el dialogo crecio —multi-item, IVA, descuentos— esos indices
 * pasaron a apuntar a otros campos, y la prueba mandaba 300 como total y 0 como
 * pagado sin que nadie lo viera. Meses en rojo.
 *
 * Y hay un cambio de verdad detras: el importe pagado YA NO SE ESCRIBE
 * directamente. Primero se elige «Sin pago», «Parcial» o «Pagó TODO», y solo
 * «Parcial» abre la casilla. Es como funciona la pantalla hoy, asi que es como
 * tiene que probarse.
 */

/** El precio base: el unico number obligatorio mientras no haya multi-item. */
const precioBase = (container) => container.querySelector('input[type="number"][required]');

/** Marca «Pagó TODO»: el pagado pasa a ser el total, sin tocar el metodo. */
const pagoTotal = () => fireEvent.click(screen.getByRole('button', { name: /Pagó TODO/i }));

/**
 * Marca «Parcial» y escribe cuanto.
 *
 * Ojo: «Parcial» pone el metodo en `fraccionado` a proposito —el resto se cobra
 * a plazos—, asi que un envio valido por esta via necesita ademas las cuotas.
 * Aqui se usa solo para los casos que se caen ANTES de esa comprobacion.
 */
const pagoParcial = (container, cuanto) => {
  fireEvent.click(screen.getByRole('button', { name: /^Parcial$/i }));
  fireEvent.change(container.querySelector('input[placeholder*="pagó"]'), { target: { value: cuanto } });
};

describe('ConversionDialog — validaciones', () => {
  it('rechaza producto vacío con toast destructive', async () => {
    const { container } = render(<ConversionDialog open onClose={vi.fn()} lead={baseLead} projectId={1} />);
    // No tocamos producto (queda vacío). Ponemos importe válido.
    const importeTotal = container.querySelector('input[type="number"][required]');
    fireEvent.change(importeTotal, { target: { value: '500' } });
    fireEvent.submit(container.querySelector('form'));
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Producto requerido', variant: 'destructive' }),
      );
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rechaza importe_total = 0 con toast destructive', async () => {
    const { container } = render(<ConversionDialog open onClose={vi.fn()} lead={baseLead} projectId={1} />);
    // El input de producto es text required, lo llenamos
    const productoInput = container.querySelector('input[placeholder*="producto"]');
    fireEvent.change(productoInput, { target: { value: 'Curso X' } });
    // importe_total queda vacío → 0
    fireEvent.submit(container.querySelector('form'));
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Importe invalido', variant: 'destructive' }),
      );
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rechaza importe_pagado > importe_total con toast destructive', async () => {
    const { container } = render(<ConversionDialog open onClose={vi.fn()} lead={baseLead} projectId={1} />);
    fireEvent.change(container.querySelector('input[placeholder*="producto"]'), { target: { value: 'Curso X' } });
    fireEvent.change(precioBase(container), { target: { value: '500' } });
    pagoParcial(container, '600');
    fireEvent.submit(container.querySelector('form'));
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Importe pagado invalido', variant: 'destructive' }),
      );
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  // Esta pasaba en VERDE, y era la peor de las tres.
  //
  // Decia probar «pagado = total», pero `numbers[1]` hacia rato que no era el
  // pagado: mandaba 500 de total y 0 de pagado, y como lo unico que comprobaba
  // era que la API se llamase, pasaba. Una prueba verde que no prueba lo que
  // dice es peor que una roja: la roja al menos se ve.
  //
  // Ahora se pulsa «Pagó TODO» —que es como se marca eso en la pantalla— y se
  // comprueban los dos importes, que es lo que el nombre promete.
  it('importe_pagado = importe_total se acepta (caso borde)', async () => {
    const { container } = render(<ConversionDialog open onClose={vi.fn()} lead={baseLead} projectId={1} onCreated={vi.fn()} />);
    fireEvent.change(container.querySelector('input[placeholder*="producto"]'), { target: { value: 'X' } });
    fireEvent.change(precioBase(container), { target: { value: '500' } });
    pagoTotal();
    fireEvent.submit(container.querySelector('form'));
    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(createMock.mock.calls[0][0]).toMatchObject({ importe_total: 500, importe_pagado: 500 });
  });
});

describe('ConversionDialog — submit', () => {
  it('submit válido llama API con lead_id, project_id, producto e importes correctos', async () => {
    const onCreated = vi.fn();
    const onClose = vi.fn();
    const { container } = render(
      <ConversionDialog open onClose={onClose} lead={baseLead} projectId={7} onCreated={onCreated} />,
    );

    fireEvent.change(container.querySelector('input[placeholder*="producto"]'), { target: { value: 'Master IA' } });
    fireEvent.change(precioBase(container), { target: { value: '1200' } });
    pagoTotal();

    fireEvent.submit(container.querySelector('form'));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));

    const payload = createMock.mock.calls[0][0];
    expect(payload).toMatchObject({
      lead_id: 99,
      project_id: 7,
      producto_contratado: 'Master IA',
      // El IVA viene incluido por defecto —el precio del curso ya es el final—
      // asi que el total es el precio base tal cual, no 1200 + 21%.
      importe_total: 1200,
      importe_pagado: 1200,
      metodo_pago: 'tarjeta',
    });

    // Desde el 15/09 el cuadro NO se cierra al registrar: se queda en el paso
    // del documento --proforma o factura-- porque esa ventana estaba detras de
    // `VITE_FACTURACION_V2` y en produccion no se habia visto nunca.
    //
    // Asi que avisar al padre y cerrar ya no pasa en el submit: pasa cuando se
    // sale de ese paso, por «Cerrar», por la X, por el fondo o con Esc.
    expect(onCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    const cerrar = [...container.querySelectorAll('button')]
      .find((b) => /Cerrar|Ahora no/.test(b.textContent || ''));
    expect(cerrar, 'el paso del documento tiene que ofrecer una salida').toBeTruthy();
    fireEvent.click(cerrar);

    expect(onCreated).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('error de API muestra toast destructive sin cerrar el dialog', async () => {
    createMock.mockRejectedValueOnce({ data: { error: 'Lead duplicado' } });
    const onClose = vi.fn();
    const { container } = render(
      <ConversionDialog open onClose={onClose} lead={baseLead} projectId={1} onCreated={vi.fn()} />,
    );
    fireEvent.change(container.querySelector('input[placeholder*="producto"]'), { target: { value: 'X' } });
    fireEvent.change(precioBase(container), { target: { value: '100' } });
    fireEvent.submit(container.querySelector('form'));
    await waitFor(() => {
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Error al registrar conversion', description: 'Lead duplicado' }),
      );
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('ConversionDialog — payment links derivados', () => {
  function pickProduct(name) {
    const productoTrigger = screen.getByRole('combobox', { name: /Producto contratado/i });
    fireEvent.click(productoTrigger);
    fireEvent.mouseDown(screen.getByRole('option', { name }));
  }

  it('usa payment_links del producto si existe array', () => {
    productsState.products = [
      {
        id: 1,
        nombre: 'Master IA',
        payment_links: [
          { label: 'Pago completo', url: 'https://buy.stripe.com/full', tipo: 'completo' },
          { label: 'Anticipo', url: 'https://buy.stripe.com/down', tipo: 'anticipo' },
        ],
      },
    ];
    render(<ConversionDialog open onClose={vi.fn()} lead={baseLead} projectId={1} />);
    pickProduct('Master IA');
    const linkTrigger = screen.getByRole('combobox', { name: /Enlace de pago/i });
    fireEvent.click(linkTrigger);
    expect(screen.getByRole('option', { name: /Pago completo/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Anticipo/i })).toBeInTheDocument();
  });

  it('si no hay payment_links usa fallback stripe_link como enlace único', () => {
    productsState.products = [
      { id: 1, nombre: 'Curso Y', stripe_link: 'https://buy.stripe.com/legacy', payment_links: null },
    ];
    render(<ConversionDialog open onClose={vi.fn()} lead={baseLead} projectId={1} />);
    pickProduct('Curso Y');
    const linkTrigger = screen.getByRole('combobox', { name: /Enlace de pago/i });
    fireEvent.click(linkTrigger);
    expect(screen.getByRole('option', { name: /Pago completo/i })).toBeInTheDocument();
  });

  it('producto sin payment_links ni stripe_link muestra mensaje "no tiene enlaces"', () => {
    productsState.products = [{ id: 1, nombre: 'Sin enlaces', payment_links: null }];
    render(<ConversionDialog open onClose={vi.fn()} lead={baseLead} projectId={1} />);
    pickProduct('Sin enlaces');
    expect(screen.getByText(/no tiene enlaces configurados/i)).toBeInTheDocument();
  });
});
