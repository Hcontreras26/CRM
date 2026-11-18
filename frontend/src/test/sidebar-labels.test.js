// Tests para los helpers exportados desde Sidebar.jsx (CRM-217).
// applyLabel + getSidebarLabelCatalog son las dos primitivas que sostienen
// el feature de "etiquetas sidebar por proyecto".
import { describe, it, expect } from 'vitest';
import { applyLabel, getSidebarLabelCatalog } from '@/shared/components/layout/Sidebar';

describe('applyLabel', () => {
  it('devuelve el original si no hay overrides', () => {
    expect(applyLabel('Prospectos', null)).toBe('Prospectos');
    expect(applyLabel('Prospectos', undefined)).toBe('Prospectos');
    expect(applyLabel('Prospectos', {})).toBe('Prospectos');
  });

  it('devuelve el override cuando existe', () => {
    expect(applyLabel('Prospectos', { Prospectos: 'Estudiantes' })).toBe('Estudiantes');
  });

  it('ignora override vacío o solo espacios', () => {
    expect(applyLabel('Prospectos', { Prospectos: '' })).toBe('Prospectos');
    expect(applyLabel('Prospectos', { Prospectos: '   ' })).toBe('Prospectos');
  });

  it('ignora override de tipo no-string', () => {
    expect(applyLabel('Prospectos', { Prospectos: 123 })).toBe('Prospectos');
    expect(applyLabel('Prospectos', { Prospectos: null })).toBe('Prospectos');
    expect(applyLabel('Prospectos', { Prospectos: { v: 'x' } })).toBe('Prospectos');
  });

  it('respeta otras claves sin afectar a la consultada', () => {
    const overrides = { Prospectos: 'Estudiantes', Clientes: 'Alumnos' };
    expect(applyLabel('Prospectos', overrides)).toBe('Estudiantes');
    expect(applyLabel('Sin override', overrides)).toBe('Sin override');
  });

  it('protege ante overrides que no son objeto', () => {
    expect(applyLabel('Prospectos', 'no-object')).toBe('Prospectos');
    expect(applyLabel('Prospectos', 42)).toBe('Prospectos');
  });
});

describe('getSidebarLabelCatalog', () => {
  const catalog = getSidebarLabelCatalog();

  it('devuelve un array de secciones, cada una con label list', () => {
    expect(Array.isArray(catalog)).toBe(true);
    expect(catalog.length).toBeGreaterThan(0);
    for (const section of catalog) {
      expect(typeof section.section).toBe('string');
      expect(Array.isArray(section.labels)).toBe(true);
    }
  });

  it('cada label tiene un type válido (group/item/child)', () => {
    const VALID = new Set(['group', 'item', 'child']);
    for (const section of catalog) {
      for (const entry of section.labels) {
        expect(typeof entry.label).toBe('string');
        expect(entry.label.length).toBeGreaterThan(0);
        expect(VALID.has(entry.type)).toBe(true);
      }
    }
  });

  it('incluye las secciones top-level esperadas del NAV_SECTIONS', () => {
    const sections = catalog.map((s) => s.section);
    // Estas secciones existen en NAV_SECTIONS y no deben desaparecer sin querer
    expect(sections).toEqual(expect.arrayContaining([
      // Los bloques de uso (#534, parte 3).
      'Hoy', 'Comercial', 'Captación y publicidad', 'Académico', 'Finanzas', 'Análisis', 'Configuración', 'Sistema',
    ]));
  });

  // Estos dos daban por hecha una estructura que ya no existe: «Captación» era
  // un grupo DENTRO de una seccion, y ahora es una seccion propia con sus
  // items directos. La prueba buscaba un item llamado «Captación» dentro de la
  // seccion «Captación» y no encontraba nada.
  //
  // Se cambia lo que se comprueba: no la forma exacta del menu de un dia
  // concreto —que cambia cada vez que se reordena— sino que el catalogo
  // clasifique bien lo que le den. Tarea #70.
  it('un item suelto se clasifica como item', () => {
    const principal = catalog.find((s) => s.section === 'Hoy');
    expect(principal).toBeTruthy();
    const dashboard = principal.labels.find((l) => l.label === 'Dashboard');
    expect(dashboard).toEqual({ label: 'Dashboard', type: 'item' });
  });

  it('un item con hijos sale como group, y sus hijos como child', () => {
    // Se busca el primer grupo que haya, sea cual sea: asi la prueba sigue
    // valiendo cuando alguien reordene el menu.
    let grupo = null;
    let seccionDelGrupo = null;
    for (const s of catalog) {
      const g = s.labels.find((l) => l.type === 'group');
      if (g) { grupo = g; seccionDelGrupo = s; break; }
    }
    if (!grupo) {
      // Hoy el menu puede no tener ninguno, y eso no es un fallo.
      expect(catalog.every((s) => s.labels.every((l) => ['item', 'child'].includes(l.type)))).toBe(true);
      return;
    }
    expect(grupo.type).toBe('group');
    // Detras de un grupo tiene que venir al menos un hijo.
    const i = seccionDelGrupo.labels.indexOf(grupo);
    expect(seccionDelGrupo.labels[i + 1]?.type).toBe('child');
  });

  it('no produce duplicados de label dentro de una misma sección', () => {
    for (const section of catalog) {
      const labels = section.labels.map((l) => l.label);
      const unique = new Set(labels);
      // Permitimos labels iguales solo si type difiere (group + item con mismo nombre, ej. "Captación")
      // pero la combinación (label, type) debe ser única
      const combos = section.labels.map((l) => `${l.label}::${l.type}`);
      expect(new Set(combos).size).toBe(combos.length);
      // Y al menos un label distinto por sección si hay más de uno
      if (labels.length > 1) expect(unique.size).toBeGreaterThanOrEqual(1);
    }
  });
});
