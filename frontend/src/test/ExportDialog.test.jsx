// Tests UI para ExportDialog (CRM-196).
// Verifica apertura, mapeo de columnas, plantillas y formato.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ExportDialog from '@/shared/components/export/ExportDialog';

const COLUMNS = [
  { key: 'name', label: 'Nombre', type: 'string', value: (r) => r.name },
  { key: 'email', label: 'Email', type: 'string', value: (r) => r.email },
  { key: 'amount', label: 'Importe', type: 'number', value: (r) => r.amount },
];

const ROWS = [
  { name: 'Ada', email: 'ada@x.com', amount: 100 },
  { name: 'Alan', email: 'alan@x.com', amount: 200 },
];

/**
 * La linea del contador, leida ENTERA.
 *
 * Estas seis comprobaciones llevaban meses en rojo por como preguntaban, no por
 * lo que comprobaban. Pedian `getByText(/3 de 3 columnas/)` y el componente
 * cambio dos veces desde que se escribieron:
 *
 *   · el numero se envolvio en un <strong>, asi que «2 filas» ya no es UN nodo
 *     de texto y testing-library no lo encuentra («the text is broken up by
 *     multiple elements», que es literalmente lo que decia el fallo);
 *   · y el separador paso de «3 de 3» a «3/3».
 *
 * Ninguna de las dos cosas rompe nada para quien usa la pantalla. Lo que estaba
 * mal era la pregunta.
 *
 * Asi que se lee el texto del parrafo completo y se comprueba ahi. Sigue
 * fallando si el contador dice un numero que no es —que es lo que estas pruebas
 * existen para pillar— y deja de fallar porque alguien ponga una etiqueta en
 * medio.
 */
const contador = () => screen.getByText(/columnas/).textContent.replace(/\s+/g, ' ');

// Mock para evitar trigger real del download (jsdom no soporta blob.text())
function mockClicks() {
  return vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
}

describe('ExportDialog', () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom no implementa URL.createObjectURL — polyfill
    if (!globalThis.URL.createObjectURL) {
      globalThis.URL.createObjectURL = vi.fn(() => 'blob:fake');
      globalThis.URL.revokeObjectURL = vi.fn();
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('no se renderiza si open=false', () => {
    render(<ExportDialog open={false} onClose={() => {}} context="leads"
      filename="test" columns={COLUMNS} rows={ROWS} />);
    expect(screen.queryByText('Exportar')).toBeNull();
  });

  it('muestra título custom y conteo de filas/columnas', () => {
    render(<ExportDialog open onClose={() => {}} context="leads" title="Exportar prospectos"
      filename="test" columns={COLUMNS} rows={ROWS} />);
    expect(screen.getByText('Exportar prospectos')).toBeInTheDocument();
    expect(contador()).toMatch(/2 filas/);
    expect(contador()).toMatch(/3\/3 columnas/);
  });

  it('renderiza los 3 botones de formato', () => {
    render(<ExportDialog open onClose={() => {}} context="leads"
      filename="test" columns={COLUMNS} rows={ROWS} />);
    expect(screen.getByText('Excel (XLSX)')).toBeInTheDocument();
    expect(screen.getByText('CSV')).toBeInTheDocument();
    expect(screen.getByText('JSON')).toBeInTheDocument();
  });

  it('cambia el formato al hacer click', () => {
    render(<ExportDialog open onClose={() => {}} context="leads"
      filename="test" columns={COLUMNS} rows={ROWS} />);
    fireEvent.click(screen.getByText('CSV'));
    expect(screen.getByText(/Exportar CSV/)).toBeInTheDocument();
  });

  it('"Ninguna" desmarca todas las columnas y deshabilita Exportar', () => {
    render(<ExportDialog open onClose={() => {}} context="leads"
      filename="test" columns={COLUMNS} rows={ROWS} />);
    fireEvent.click(screen.getByText('Ninguna'));
    expect(contador()).toMatch(/0\/3 columnas/);
    const exportBtn = screen.getByText(/Exportar Excel/i).closest('button');
    expect(exportBtn).toBeDisabled();
  });

  it('"Todas" vuelve a marcar todas las columnas', () => {
    render(<ExportDialog open onClose={() => {}} context="leads"
      filename="test" columns={COLUMNS} rows={ROWS} />);
    fireEvent.click(screen.getByText('Ninguna'));
    fireEvent.click(screen.getByText('Todas'));
    expect(contador()).toMatch(/3\/3 columnas/);
  });

  it('toggle individual de checkbox actualiza el contador', () => {
    render(<ExportDialog open onClose={() => {}} context="leads"
      filename="test" columns={COLUMNS} rows={ROWS} />);
    const checkbox = screen.getByLabelText(/Incluir columna Nombre/i);
    fireEvent.click(checkbox);
    expect(contador()).toMatch(/2\/3 columnas/);
  });

  it('renombrar la columna actualiza el input pero no el contador', () => {
    render(<ExportDialog open onClose={() => {}} context="leads"
      filename="test" columns={COLUMNS} rows={ROWS} />);
    const labelInput = screen.getByLabelText(/Etiqueta de columna name/i);
    fireEvent.change(labelInput, { target: { value: 'Nombre completo' } });
    expect(labelInput.value).toBe('Nombre completo');
    expect(contador()).toMatch(/3\/3 columnas/);
  });

  it('botón Cancelar dispara onClose', () => {
    const onClose = vi.fn();
    render(<ExportDialog open onClose={onClose} context="leads"
      filename="test" columns={COLUMNS} rows={ROWS} />);
    fireEvent.click(screen.getByText('Cancelar'));
    expect(onClose).toHaveBeenCalled();
  });

  it('Esc cierra el dialog', () => {
    const onClose = vi.fn();
    render(<ExportDialog open onClose={onClose} context="leads"
      filename="test" columns={COLUMNS} rows={ROWS} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('exporta CSV al click en Exportar y llama onClose', async () => {
    mockClicks();
    const onClose = vi.fn();
    render(<ExportDialog open onClose={onClose} context="leads"
      filename="test" columns={COLUMNS} rows={ROWS} defaultFormat="csv" />);
    const exportBtn = screen.getByText(/Exportar CSV/i).closest('button');
    fireEvent.click(exportBtn);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('guardar plantilla persiste en localStorage scoped por contexto', () => {
    render(<ExportDialog open onClose={() => {}} context="leads"
      filename="test" columns={COLUMNS} rows={ROWS} />);
    fireEvent.click(screen.getByText(/Guardar configuración como plantilla/));
    const input = screen.getByPlaceholderText('Nombre de la plantilla');
    fireEvent.change(input, { target: { value: 'Mi plantilla' } });
    fireEvent.click(screen.getByText('Guardar'));
    // Plantilla aparece en la sección
    expect(screen.getByText('Plantillas guardadas')).toBeInTheDocument();
    expect(screen.getByText('Mi plantilla')).toBeInTheDocument();
  });

  it('aplicar plantilla restaura su formato y columnas', () => {
    // Sembrar una plantilla previa en localStorage
    const tpl = {
      id: 'pre',
      name: 'Solo email',
      context: 'leads',
      format: 'csv',
      columns: [
        { key: 'email', label: 'Correo', included: true },
        { key: 'name', label: 'Nombre', included: false },
        { key: 'amount', label: 'Importe', included: false },
      ],
      createdAt: new Date().toISOString(),
    };
    localStorage.setItem('crm.exportTemplates.v1', JSON.stringify([tpl]));

    render(<ExportDialog open onClose={() => {}} context="leads"
      filename="test" columns={COLUMNS} rows={ROWS} />);

    fireEvent.click(screen.getByText('Solo email'));
    expect(contador()).toMatch(/1\/3 columnas/);
    expect(screen.getByText(/Exportar CSV/i)).toBeInTheDocument();
  });

  it('eliminar plantilla la quita del listado', () => {
    const tpl = {
      id: 'pre', name: 'A borrar', context: 'leads', format: 'xlsx',
      columns: [], createdAt: new Date().toISOString(),
    };
    localStorage.setItem('crm.exportTemplates.v1', JSON.stringify([tpl]));

    render(<ExportDialog open onClose={() => {}} context="leads"
      filename="test" columns={COLUMNS} rows={ROWS} />);

    fireEvent.click(screen.getByLabelText(/Eliminar plantilla A borrar/i));
    expect(screen.queryByText('A borrar')).toBeNull();
  });
});
