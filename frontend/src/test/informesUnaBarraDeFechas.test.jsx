import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen, fireEvent } from '@testing-library/react';
import RangoRapido from '@/shared/components/ui/RangoRapido';
import { ATAJOS } from '@/shared/lib/rangosDeFecha';

/*
  Reportes (/informes), QA de /testeo del 18/11: a 1280 px la cabecera tenía
  622 px de scroll horizontal y tapaba el selector de proyecto. Llevaba DOS
  barras de atajos de fecha —una copia propia («Periodos rapidos», con «Este
  año») y además la compartida `RangoRapido`—, más «desde/hasta», CSV y PDF.
  Es lo mismo que pasó en Ventas e Ingresos (#223, #234): se queda una sola, la
  compartida, y «Este año» no se pierde.
*/

const fuente = readFileSync(resolve(__dirname, '../modules/reports/pages/ReportsPage.tsx'), 'utf8');
const hoyIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

describe('Reportes tiene UNA barra de atajos de fecha', () => {
  it('un solo RangoRapido y ninguna fila de atajos propia', () => {
    expect(fuente.match(/<RangoRapido\b/g) || []).toHaveLength(1);
    expect(fuente).not.toMatch(/ATAJOS\.map\(/);
    expect(fuente).not.toMatch(/Periodos rapidos/);
  });

  it('la barra ofrece «Este año», que tenía la fila que se quita', () => {
    const barra = fuente.slice(fuente.indexOf('<RangoRapido'));
    expect(barra.slice(0, barra.indexOf('/>'))).toMatch(/\besteAno\b/);
  });

  it('quitar el atajo puesto no deja el informe sin periodo', () => {
    expect(fuente).toMatch(/alElegir=\{\(r\) => setRange\(r\.from && r\.to \? r : rangoPorDefecto\(\)\)\}/);
  });
});

describe('RangoRapido con «Este año»', () => {
  it('sin pedirlo, no sale', () => {
    render(<RangoRapido valor={{ from: '', to: '' }} alElegir={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Este año' })).toBeNull();
    expect(screen.getAllByRole('group', { name: 'Atajos de fecha' })).toHaveLength(1);
  });

  it('pedido, va del 1 de enero a hoy y se marca cuando es ese rango', () => {
    const alElegir = vi.fn();
    const desde = `${new Date().getFullYear()}-01-01`;
    const { rerender } = render(<RangoRapido valor={{ from: '', to: '' }} alElegir={alElegir} esteAno />);
    fireEvent.click(screen.getByRole('button', { name: 'Este año' }));
    expect(alElegir).toHaveBeenCalledWith({ from: desde, to: hoyIso() });

    rerender(<RangoRapido valor={{ from: desde, to: hoyIso() }} alElegir={alElegir} esteAno />);
    // En enero «Este mes» es el mismo rango y se marca ese, el primero.
    const puesto = screen.getAllByRole('button').find((b) => b.getAttribute('aria-pressed') === 'true');
    expect(puesto?.textContent).toBe(new Date().getMonth() === 0 ? 'Este mes' : 'Este año');
  });

  it('cuenta lo mismo que el «Este año» de rangosDeFecha', () => {
    const alElegir = vi.fn();
    render(<RangoRapido valor={{ from: '', to: '' }} alElegir={alElegir} esteAno />);
    fireEvent.click(screen.getByRole('button', { name: 'Este año' }));
    expect(alElegir).toHaveBeenCalledWith(ATAJOS.find((a) => a.clave === 'este_ano').calcular(new Date()));
  });
});
