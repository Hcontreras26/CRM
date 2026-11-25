import { describe, it, expect, beforeEach } from 'vitest';
import { render } from '@testing-library/react';

/*
  11/11 · Carlos con la empresa CEDIA elegida en el selector («CEDIA ·
  8 campus») veía en el menú el logo de Fono Aprende y «BETA 2.2.0».

  - Fono Aprende salía porque, al volver a entrar, el login cogía el primer
    campus de la lista (en CEDIA, por orden alfabético, Fono Aprende) y dejaba
    la empresa guardada: empresa en el selector, campus en el menú.
  - Con una empresa elegida, el menú lleva la marca de la EMPRESA: su logo o su
    nombre corto. Nunca el de un campus.
  - La versión ya no se escribe a mano: sale de Novedades (versionQueSeVe.test.jsx).
*/

const { eleccionAlEntrar, nombreCortoDeEmpresa, ALL_PROJECTS_ID } = await import('@/contexts/AuthContext');
const { EmpresaAvatar, resolverLogoEmpresa } = await import('@/shared/components/ui/ProjectAvatar');

const CEDIA = 8; const ICTESS = 9;
const CAMPUS = [
  { id: 3, nombre: 'Fono Aprende', sociedad_emisora_id: CEDIA },
  { id: 6, nombre: 'ISAEG', sociedad_emisora_id: CEDIA },
  { id: 4, nombre: 'ICTESS', sociedad_emisora_id: ICTESS },
];

beforeEach(() => { localStorage.clear(); });

describe('al entrar, la empresa y el campus no van a la vez', () => {
  it('con CEDIA guardada y «todos» perdido al salir, se entra en CEDIA, no en Fono Aprende', () => {
    localStorage.setItem('crm_active_issuer_id', String(CEDIA));
    expect(eleccionAlEntrar({ proyectos: CAMPUS, guardado: null, delServidor: 3 }))
      .toEqual({ projectId: ALL_PROJECTS_ID, issuerId: CEDIA });
  });

  it('si el enlace pide un campus, manda el campus y se olvida la empresa', () => {
    localStorage.setItem('crm_active_issuer_id', String(CEDIA));
    expect(eleccionAlEntrar({ proyectos: CAMPUS, deLaUrl: 6 })).toEqual({ projectId: 6, issuerId: null });
  });

  it('una empresa que ya no es suya no se restaura', () => {
    localStorage.setItem('crm_active_issuer_id', '99');
    expect(eleccionAlEntrar({ proyectos: CAMPUS, guardado: '4' })).toEqual({ projectId: 4, issuerId: null });
  });

  it('sin empresa guardada, como siempre: lo guardado, el del servidor o el primero', () => {
    expect(eleccionAlEntrar({ proyectos: CAMPUS, guardado: String(ALL_PROJECTS_ID) }).projectId).toBe(ALL_PROJECTS_ID);
    expect(eleccionAlEntrar({ proyectos: CAMPUS, guardado: null, delServidor: 6 }).projectId).toBe(6);
    expect(eleccionAlEntrar({ proyectos: CAMPUS }).projectId).toBe(3);
  });

  it('con un solo campus no hay empresa que elegir', () => {
    localStorage.setItem('crm_active_issuer_id', String(ICTESS));
    expect(eleccionAlEntrar({ proyectos: [CAMPUS[2]] })).toEqual({ projectId: 4, issuerId: null });
  });
});

describe('la marca de la empresa en el menú', () => {
  it('el nombre corto: el alias o la primera palabra', () => {
    expect(nombreCortoDeEmpresa({ razon_social: 'CEDIA Investigación y Desarrollo SL' })).toBe('CEDIA');
    expect(nombreCortoDeEmpresa({ alias: 'Solvenic', razon_social: 'Ictess Ingeniería e Innovación SL' })).toBe('Solvenic');
  });

  it('sin logo, su nombre corto escrito; ni una imagen de campus', () => {
    const { container } = render(<EmpresaAvatar empresa={{ id: CEDIA, nombre: 'CEDIA Investigación y Desarrollo SL', nombreCorto: 'CEDIA', logo_url: null }} size="lg" />);
    expect(container.textContent).toBe('CEDIA');
    expect(container.querySelector('img')).toBeNull();
  });

  it('con logo, el suyo', () => {
    const { container } = render(<EmpresaAvatar empresa={{ id: ICTESS, nombreCorto: 'Ictess', logo_url: 'https://ictess.example/logo.png' }} />);
    expect(container.querySelector('img').getAttribute('src')).toBe('https://ictess.example/logo.png');
  });

  it('el logo subido al CRM se pide a su dirección pública', () => {
    expect(resolverLogoEmpresa({ id: 11, logo_url: null, logo_subido: true })).toMatch(/\/api\/invoices\/issuers\/11\/logo$/);
    expect(resolverLogoEmpresa({ id: 8, logo_url: null })).toBeNull();
  });
});
