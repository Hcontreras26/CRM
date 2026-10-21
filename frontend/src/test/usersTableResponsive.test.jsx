import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import UsersTable from '@/modules/users/components/UsersTable';

describe('UsersTable responsive y scroll horizontal', () => {
  const usuariosFalsos = [
    {
      id: 1,
      nombre: 'Administrador Demo',
      email: 'admin@empresa.com',
      role: 'admin',
      active: true,
      last_login_at: '2026-10-10T12:00:00Z',
      projects: [{ projectId: 1, role: 'admin' }],
    },
  ];

  it('el contenedor de la tabla en pantallas anchas tiene overflow-x-auto para no desbordar la página', () => {
    const { container } = render(
      <UsersTable
        users={usuariosFalsos}
        projects={[{ id: 1, nombre: 'Campus Principal' }]}
        disponibilidad={new Map()}
        openMenuId={null}
        onOpenMenu={() => {}}
        onEdit={() => {}}
        onToggleActive={() => {}}
        onAvailability={() => {}}
        hayFiltroActivo={false}
        onClearFilters={() => {}}
      />
    );

    // Debe existir el contenedor xl con overflow-x-auto
    const contenedorTabla = container.querySelector('.xl\\:block');
    expect(contenedorTabla).not.toBeNull();
    expect(contenedorTabla?.className).toContain('overflow-x-auto');
    expect(contenedorTabla?.querySelector('table')).not.toBeNull();
  });

  it('la columna Acciones va fija a la derecha, para no perderla al desplazar la tabla', () => {
    const { container } = render(
      <UsersTable
        users={usuariosFalsos}
        projects={[{ id: 1, nombre: 'Campus Principal' }]}
        disponibilidad={new Map()}
        openMenuId={null}
        onOpenMenu={() => {}}
        onEdit={() => {}}
        onToggleActive={() => {}}
        onAvailability={() => {}}
        hayFiltroActivo={false}
        onClearFilters={() => {}}
      />
    );

    const cabeceras = [...container.querySelectorAll('.xl\\:block th')];
    const acciones = cabeceras.find((th) => th.textContent === 'Acciones');
    expect(acciones?.className).toContain('sticky');
    expect(acciones?.className).toContain('right-0');
    const celda = container.querySelector('.xl\\:block tbody tr td:last-child');
    expect(celda?.className).toContain('sticky');
  });

  it('los textos largos se recortan en un bloque dentro de la celda (una <td> ignora max-width)', () => {
    const { container } = render(
      <UsersTable
        users={usuariosFalsos}
        projects={[{ id: 1, nombre: 'Campus Principal' }]}
        disponibilidad={new Map()}
        openMenuId={null}
        onOpenMenu={() => {}}
        onEdit={() => {}}
        onToggleActive={() => {}}
        onAvailability={() => {}}
        hayFiltroActivo={false}
        onClearFilters={() => {}}
      />
    );

    for (const td of container.querySelectorAll('.xl\\:block td')) {
      expect(td.className).not.toMatch(/max-w-/);
    }
    const recortes = container.querySelectorAll('.xl\\:block td div.truncate[class*="max-w-"]');
    // Email y Proyectos.
    expect(recortes.length).toBeGreaterThanOrEqual(2);
  });

  it('contiene la vista de tarjetas para pantallas estrechas (xl:hidden)', () => {
    const { container } = render(
      <UsersTable
        users={usuariosFalsos}
        projects={[{ id: 1, nombre: 'Campus Principal' }]}
        disponibilidad={new Map()}
        openMenuId={null}
        onOpenMenu={() => {}}
        onEdit={() => {}}
        onToggleActive={() => {}}
        onAvailability={() => {}}
        hayFiltroActivo={false}
        onClearFilters={() => {}}
      />
    );

    const contenedorMovil = container.querySelector('.xl\\:hidden');
    expect(contenedorMovil).not.toBeNull();
  });

  it('un usuario desactivado se atenúa celda a celda: la columna fija de Acciones queda opaca', () => {
    const desactivado = { ...usuariosFalsos[0], id: 2, nombre: 'Usuaria Desactivada', active: false };
    const { container } = render(
      <UsersTable
        users={[desactivado]}
        projects={[{ id: 1, nombre: 'Campus Principal' }]}
        disponibilidad={new Map()}
        openMenuId={null}
        onOpenMenu={() => {}}
        onEdit={() => {}}
        onToggleActive={() => {}}
        onAvailability={() => {}}
        hayFiltroActivo={false}
        onClearFilters={() => {}}
      />
    );

    const fila = container.querySelector('.xl\\:block tbody tr');
    // Con la opacidad en la fila, la celda fija quedaba al 50 % y lo que pasa por
    // debajo se transparentaba.
    expect(fila.className).not.toContain('opacity-');
    const celdas = [...fila.querySelectorAll('td')];
    const fija = celdas[celdas.length - 1];
    expect(fija.className).toContain('sticky');
    expect(fija.className).not.toContain('opacity-');
    expect(fija.className).toContain('bg-card');
    // El resto de celdas, atenuadas.
    for (const td of celdas.slice(0, -1)) expect(td.className).toContain('opacity-50');
  });

  it('sin colores a mano en la columna fija: el borde es el token del CRM', () => {
    const { container } = render(
      <UsersTable
        users={usuariosFalsos}
        projects={[{ id: 1, nombre: 'Campus Principal' }]}
        disponibilidad={new Map()}
        openMenuId={null}
        onOpenMenu={() => {}}
        onEdit={() => {}}
        onToggleActive={() => {}}
        onAvailability={() => {}}
        hayFiltroActivo={false}
        onClearFilters={() => {}}
      />
    );

    const fijas = container.querySelectorAll('.xl\\:block .sticky');
    expect(fijas.length).toBe(2); // cabecera y celda
    for (const el of fijas) {
      expect(el.className).not.toMatch(/rgba?\(|#[0-9a-f]{3,6}\b/i);
      expect(el.className).toContain('border-l');
      expect(el.className).toContain('border-border');
    }
  });
});
