import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import fs from 'fs';
import path from 'path';

/*
  #346 · Con la empresa CEDIA arriba, el filtro de campus de Prospectos
  enseñaba campus de otras empresas (ICTESS, Academia IA, Pruebas).

  - Con una empresa elegida arriba, solo sus campus.
  - Con «Todas», todos los suyos… menos los de pruebas: «un proyecto de
    pruebas solo se ve si lo eliges» (migración 148, `SIN_PRUEBAS` en el servidor).
  - El resto de pantallas con ese filtro siguen la misma regla: la de
    `useAmbito.ts`, no una lista propia.
*/

const CTX = vi.hoisted(() => ({ projects: [], activeIssuerId: null }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => CTX }));

const { delAmbito, useIdsDelAmbito, useProyectosDelAmbito } = await import('@/shared/hooks/useAmbito');

const CEDIA = 1; const LATERAL = 2; const PRUEBAS = 3;
const CAMPUS = [
  { id: 10, nombre: 'Psiko Aprende', sociedad_emisora_id: CEDIA },
  { id: 11, nombre: 'Fono Aprende', sociedad_emisora_id: CEDIA },
  { id: 20, nombre: 'ICTESS', sociedad_emisora_id: LATERAL },
  { id: 21, nombre: 'ACADEMIA IA', sociedad_emisora_id: LATERAL },
  { id: 30, nombre: 'Pruebas', sociedad_emisora_id: PRUEBAS, es_prueba: true },
];
const nombres = (l) => l.map((p) => p.nombre);

describe('los campus del ámbito (#346)', () => {
  it('con CEDIA arriba, solo los de CEDIA: ni ICTESS, ni Academia IA, ni Pruebas', () => {
    expect(nombres(delAmbito(CAMPUS, CEDIA))).toEqual(['Psiko Aprende', 'Fono Aprende']);
  });

  it('con «Todas», todos los suyos menos los de pruebas', () => {
    expect(nombres(delAmbito(CAMPUS, null))).toEqual(['Psiko Aprende', 'Fono Aprende', 'ICTESS', 'ACADEMIA IA']);
  });

  it('el de pruebas sí sale si se elige su empresa: se ve si lo eliges', () => {
    expect(nombres(delAmbito(CAMPUS, PRUEBAS))).toEqual(['Pruebas']);
  });

  it('nunca el «-1» de «Todos los proyectos», ni nada con la lista vacía', () => {
    expect(delAmbito([{ id: -1, nombre: 'Todos' }, ...CAMPUS], null).map((p) => p.id)).not.toContain(-1);
    expect(delAmbito(null, null)).toEqual([]);
  });

  it('los dos hooks dicen lo mismo', () => {
    CTX.projects = CAMPUS;
    CTX.activeIssuerId = LATERAL;
    expect(nombres(renderHook(() => useProyectosDelAmbito()).result.current)).toEqual(['ICTESS', 'ACADEMIA IA']);
    expect(renderHook(() => useIdsDelAmbito()).result.current).toEqual([20, 21]);
    CTX.activeIssuerId = null;
    expect(renderHook(() => useIdsDelAmbito()).result.current).toEqual([10, 11, 20, 21]);
  });
});

describe('las pantallas con filtro de campus usan esa regla, no la lista entera', () => {
  const leer = (f) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

  it('Prospectos: el filtro «Proyecto» y el export, con los campus del ámbito', () => {
    const src = leer('modules/leads/pages/LeadsPage.tsx');
    expect(src).toMatch(/useProyectosDelAmbito/);
    expect(src).toMatch(/projects=\{campusDelAmbito\}/);
    expect(src).toMatch(/exportableProjects = campusDelAmbito/);
  });

  it('Cuentas por cobrar, Cola del día, Seguimiento y Proceso comercial', () => {
    for (const f of ['modules/accounting/pages/ReceivablePage.tsx', 'modules/proceso/pages/ColaDelDiaPage.tsx',
      'modules/proceso/pages/SeguimientoPage.tsx', 'modules/proceso/pages/ProcesoPage.tsx']) {
      expect(leer(f), f).toMatch(/useProyectosDelAmbito/);
    }
    expect(leer('modules/accounting/pages/ReceivablePage.tsx')).not.toMatch(/\(projects \|\| \[\]\)\.map/);
  });
});
