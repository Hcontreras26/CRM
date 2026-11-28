// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

/**
 * «Tráfico orgánico» a CSV (#1193): con el permiso salen los dos botones y el
 * fichero lleva la cabecera y las filas que se ven; sin datos, apagados; una
 * búsqueda que empieza por «=» sale con apóstrofo; si la lista llegó al tope,
 * el botón lo dice.
 */

const get = vi.hoisted(() => vi.fn());
const permisos = vi.hoisted(() => ({ ver: true }));
vi.mock('@/shared/api/client', () => ({ default: { get, post: vi.fn() } }));
vi.mock('@/shared/hooks/usePermission', () => ({
  default: () => ({ can: (k) => (k === 'search_console.view' ? permisos.ver : false) }),
}));
vi.mock('@/shared/hooks/useCampusDeLaPantalla', () => ({
  useCampusDeLaPantalla: () => ({ id: 7, nombre: 'Psiko Aprende' }),
}));
vi.mock('@/shared/components/ui/ElegirCampus', () => ({ default: () => null }));
vi.mock('recharts', () => {
  const Nada = () => null;
  return { LineChart: Nada, Line: Nada, XAxis: Nada, YAxis: Nada, Tooltip: Nada, ResponsiveContainer: Nada, CartesianGrid: Nada };
});

const { default: SeoPage } = await import('@/modules/seo/pages/SeoPage');
const { consultasEnCsv, paginasEnCsv } = await import('@/modules/seo/components/ExportarCsvGsc');

const RESUMEN = {
  periodo: { desde: '2026-10-28', hasta: '2026-11-24' },
  anterior: { desde: '2026-09-30', hasta: '2026-10-27', dias: 28, clics: 90, impresiones: 2000, ctr: 4.5, posicion: 9 },
  total: { dias: 28, clics: 100, impresiones: 2500, ctr: 4, posicion: 8.4 },
  ultimo_dia: '2026-11-24',
  dias: [],
};
const CONSULTAS = [
  { consulta: 'máster en psicología', clics: 40, clics_antes: 31, impresiones: 900, ctr: 4.44, posicion: 6.25 },
  { consulta: '=HYPERLINK("http://x")', clics: 1, clics_antes: null, impresiones: 12, ctr: 8.33, posicion: 14 },
];
const PAGINAS = {
  ctr_medio: 4,
  filas: [{ host: 'psikoaprende.com', ruta: '/curso/ansiedad', clics: 50, clics_antes: 20, impresiones: 1200,
    ctr: 4.17, posicion: 7.8, indexacion: null, oportunidad: false }],
};

function servidor({ consultas = CONSULTAS, paginas = PAGINAS } = {}) {
  get.mockImplementation((url) => {
    const d = (data) => Promise.resolve({ success: true, data });
    if (url.startsWith('/search-console/estado')) return d({ activo: true, campus: [{ project_id: 7, nombre: 'Psiko Aprende', site_url: 'sc-domain:psikoaprende.com', last_synced_at: null, last_status: 'ok', last_error: null }] });
    if (url.startsWith('/search-console/resumen')) return d(RESUMEN);
    if (url.startsWith('/search-console/consultas')) return d(consultas);
    if (url.startsWith('/search-console/paginas')) return d(paginas);
    if (url.startsWith('/search-console/indexacion')) return d({ indexadas: 0, no_indexadas: 0, errores: 0, paginas: [] });
    if (url.startsWith('/search-console/semana')) return d({ con_datos: false });
    return d(null);
  });
}

const blobs = [];
// jsdom no trae Blob.text(): se leen los bytes, sin quitar el BOM, que es lo que se comprueba.
const leer = (b) => new Promise((ok) => {
  const r = new FileReader();
  r.onload = () => ok(new TextDecoder('utf-8', { ignoreBOM: true }).decode(new Uint8Array(r.result)));
  r.readAsArrayBuffer(b);
});
beforeEach(() => {
  permisos.ver = true;
  blobs.length = 0;
  URL.createObjectURL = vi.fn((b) => { blobs.push(b); return 'blob:x'; });
  URL.revokeObjectURL = vi.fn();
  HTMLAnchorElement.prototype.click = vi.fn();
});
afterEach(() => { cleanup(); get.mockReset(); });

const pintar = () => render(<MemoryRouter><SeoPage /></MemoryRouter>);
const botones = () => screen.queryAllByRole('button', { name: /Exportar CSV/ });

describe('Tráfico orgánico: exportar a CSV', () => {
  it('con el permiso salen los dos botones y el fichero lleva lo que se ve', async () => {
    servidor();
    pintar();
    await waitFor(() => expect(botones()).toHaveLength(2));
    const [bBusquedas, bPaginas] = botones();
    expect(bBusquedas.disabled).toBe(false);

    fireEvent.click(bBusquedas);
    const texto = await leer(blobs[0]);
    expect(texto.charCodeAt(0)).toBe(0xFEFF);
    const lineas = texto.slice(1).split('\r\n');
    expect(lineas[0]).toBe('"Búsqueda";"Clics";"Clics periodo anterior";"Impresiones";"CTR (%)";"Posición"');
    expect(lineas[1]).toBe('"máster en psicología";"40";"31";"900";"4,44";"6,3"');
    expect(lineas).toHaveLength(3);

    fireEvent.click(bPaginas);
    const pag = (await leer(blobs[1])).slice(1).split('\r\n');
    expect(pag[0]).toBe('"Página";"Clics";"Clics periodo anterior";"Impresiones";"CTR (%)";"Posición"');
    expect(pag[1]).toBe('"psikoaprende.com/curso/ansiedad";"50";"20";"1200";"4,17";"7,8"');
  });

  it('con el buscador, solo las filas que se ven', async () => {
    servidor();
    pintar();
    await waitFor(() => expect(botones()).toHaveLength(2));
    fireEvent.change(screen.getByPlaceholderText('máster…'), { target: { value: 'máster' } });
    fireEvent.click(botones()[0]);
    const lineas = (await leer(blobs[0])).slice(1).split('\r\n');
    expect(lineas).toHaveLength(2);
    expect(lineas[1]).toMatch(/^"máster en psicología"/);
  });

  it('una búsqueda que empieza por «=» sale con apóstrofo', () => {
    const lineas = consultasEnCsv(CONSULTAS).split('\r\n');
    expect(lineas[2]).toBe('"\'=HYPERLINK(""http://x"")";"1";"";"12";"8,33";"14"');
    expect(paginasEnCsv([]).split('\r\n')).toHaveLength(1);
  });

  it('sin datos, los botones están apagados', async () => {
    servidor({ consultas: [], paginas: { ctr_medio: null, filas: [] } });
    pintar();
    await waitFor(() => expect(botones()).toHaveLength(2));
    for (const b of botones()) expect(b.disabled).toBe(true);
  });

  it('sin el permiso no sale', async () => {
    permisos.ver = false;
    servidor();
    pintar();
    await screen.findByText('máster en psicología');
    expect(botones()).toHaveLength(0);
  });

  it('si la lista llegó al tope, el botón lo dice', async () => {
    const muchas = Array.from({ length: 200 }, (_, i) => ({ consulta: `c${i}`, clics: 1, clics_antes: 0, impresiones: 5, ctr: 20, posicion: 3 }));
    servidor({ consultas: muchas });
    pintar();
    await waitFor(() => expect(botones()).toHaveLength(2));
    expect(botones()[0].textContent).toMatch(/de las 200 primeras/);
    expect(botones()[0].title).toMatch(/solo carga las 200 primeras búsquedas/);
    expect(botones()[1].textContent).not.toMatch(/primeras/);
  });
});
