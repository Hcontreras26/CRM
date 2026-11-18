import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

/**
 * El bloque «antes de guardar el token» (conexión de los proyectos IA).
 *
 * Los proyectos IA se conectan con un access token y sin webhook. Guardar ese
 * token no es un paso inocuo: arranca el sondeo, y a los cinco minutos el CRM
 * empieza a traer cobros de Stripe por su cuenta. Si el suelo de facturación
 * está mal, entra el histórico —hay 576 cobros anteriores al alta de su
 * proyecto, ya facturados fuera— y cada uno que se asocie emite una factura
 * repetida.
 *
 * Por eso este bloque se enseña ANTES del campo, y por eso se prueba:
 *
 *   - LA FECHA, en una zona con offset negativo. La primera versión usaba
 *     `new Date('2026-09-15')`, que es medianoche UTC, y en America/Caracas
 *     —donde se probó, y donde está el equipo— pintaba «14 sept». Un día de
 *     menos justo en la fecha que decide qué se factura.
 *   - QUE SE VEAN LOS TRES ESCALONES y cuál manda: quien lo mira necesita
 *     comprobar que manda el que cree, no solo leer el resultado.
 *   - QUE UN FALLO SE DIGA. Si la consulta cae y el bloque se queda mudo, se
 *     lee como «no hay nada que avisar», que es lo contrario de la verdad.
 */

// Zona con offset negativo, la del equipo, que es donde se veía el día de
// menos. Se fija antes de importar nada que toque fechas.
//
// Y con una advertencia honesta: en Windows, asignar TZ con el proceso ya
// arrancado no siempre surte efecto. La prueba caza el fallo igual porque las
// máquinas del equipo YA están en UTC-4 —ahí se encontró—, y en un CI Linux la
// asignación sí funciona. En una máquina en UTC pasaría estando el fallo: esta
// prueba es una red, no una demostración.
process.env.TZ = 'America/Caracas';

const get = vi.fn();
vi.mock('@/shared/api/client', () => ({ default: { get: (...a) => get(...a) } }));

const CorteDeFacturacion = (await import('@/modules/accounting/components/CorteDeFacturacion')).default;

const BASE = {
  proyecto: 'Psicologo IA',
  sociedadEmisoraId: 3,
  corteMano: null,
  primeraFactura: null,
  altaProyecto: '2026-09-15',
  corte: '2026-09-15',
  manda: 'alta_proyecto',
};

function responde(extra = {}) {
  get.mockResolvedValue({ success: true, data: { ...BASE, ...extra } });
}

beforeEach(() => {
  get.mockReset();
  responde();
});

describe('la fecha del corte', () => {
  it('no pierde un día en una zona con offset negativo', async () => {
    render(<CorteDeFacturacion projectId={7} />);
    // Sale dos veces —en la frase y en la tabla de escalones—, y las dos tienen
    // que decir lo mismo: `findAll`, no `find`.
    const vistas = await screen.findAllByText(/15 sept 2026/);
    expect(vistas.length).toBeGreaterThanOrEqual(2);
    // El fallo que hubo: el día anterior. Que no vuelva.
    expect(screen.queryByText(/14 sept 2026/)).toBeNull();
  });
});

describe('los tres escalones', () => {
  it('se ven los tres aunque solo mande uno', async () => {
    responde({ corteMano: null, primeraFactura: null });
    const { container } = render(<CorteDeFacturacion projectId={7} />);
    await screen.findByText(/Antes de guardar el token/);
    const t = container.textContent;
    expect(t).toContain('Corte puesto a mano');
    expect(t).toContain('Primera factura de la sociedad');
    expect(t).toContain('Alta del proyecto en el CRM');
  });

  it('el corte a mano manda sobre los otros dos', async () => {
    responde({ corteMano: '2026-06-01', primeraFactura: '2026-02-09', corte: '2026-06-01', manda: 'corte_mano' });
    const { container } = render(<CorteDeFacturacion projectId={7} />);
    await screen.findByText(/Antes de guardar el token/);
    expect(container.textContent).toContain('el corte puesto a mano');
    expect(container.textContent).toContain('01 jun 2026');
  });

  it('sin ninguno de los tres, lo dice en rojo y no inventa una fecha', async () => {
    // Un proyecto sin alta ni corte ni facturas: aquí entra el histórico
    // entero, y callarlo sería lo peor que puede hacer esta caja.
    responde({ corteMano: null, primeraFactura: null, altaProyecto: null, corte: null, manda: null });
    const { container } = render(<CorteDeFacturacion projectId={7} />);
    await screen.findByText(/no tiene suelo de facturación/);
    expect(container.textContent).not.toMatch(/Se factura desde el/);
  });
});

describe('lo que falta del proyecto', () => {
  it('avisa si no hay sociedad emisora', async () => {
    responde({ sociedadEmisoraId: null });
    render(<CorteDeFacturacion projectId={7} />);
    expect(await screen.findByText(/no tiene/)).toBeTruthy();
    expect(screen.getByText(/sociedad emisora/)).toBeTruthy();
  });

  it('y no avisa cuando sí la hay', async () => {
    responde({ sociedadEmisoraId: 3 });
    const { container } = render(<CorteDeFacturacion projectId={7} />);
    await screen.findByText(/Antes de guardar el token/);
    expect(container.textContent).not.toContain('sociedad emisora');
  });
});

describe('cuando la consulta falla', () => {
  it('lo dice, en vez de quedarse mudo', async () => {
    get.mockRejectedValue(new Error('sin red'));
    render(<CorteDeFacturacion projectId={7} />);
    await waitFor(() => expect(screen.getByText(/No se ha podido consultar/)).toBeTruthy());
    expect(screen.getByText(/No guardes el token hasta saberlo/)).toBeTruthy();
  });
});
