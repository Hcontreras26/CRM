import { describe, it, expect } from 'vitest';
import { isValidElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Routes, Navigate, createRoutesFromChildren, matchRoutes } from 'react-router-dom';
import { ChartBar } from '@phosphor-icons/react';
import App from '@/App';
import { NAV_SECTIONS, NavItem, EntradaProximamente } from '@/shared/components/layout/Sidebar';

/*
  Ninguna entrada del menú lleva a «Página no encontrada» (#226, #234).

  Diego, 10/10: lo que no existe, «Próximamente» y sin enlace; lo que existe,
  que funcione y esté en el menú. Aquí lo que fallaba era Google Ads: estaba
  marcada `comingSoon`, pero el menú solo miraba la lista de la beta, y fuera
  de ella —en /testeo— era un enlace a /google-ads, que no tiene pantalla.

  Las rutas salen del propio App.jsx —se llama a `App()` y se recorre el árbol
  de <Route>—, no de una lista copiada aquí: una lista copiada da la razón al
  menú aunque App.jsx cambie.

  La misma prueba vive en CRM-ISEIE (`__smoke__/menuSinRutasRotas.test.jsx`).
*/

function buscarRoutes(el) {
  if (!el) return null;
  if (Array.isArray(el)) {
    for (const x of el) { const r = buscarRoutes(x); if (r) return r; }
    return null;
  }
  if (!isValidElement(el)) return null;
  if (el.type === Routes) return el;
  return buscarRoutes(el.props?.children);
}

const RUTAS = createRoutesFromChildren(buscarRoutes(App()).props.children);

/**
 * A qué pantalla lleva una dirección, siguiendo las redirecciones. `null` si
 * cae en el `*` (la página de error) o si solo la recoge una ruta con `:id`:
 * `/prospectos/loquesea` encaja con la ficha de un prospecto y no por eso existe.
 */
function destino(camino, saltos = 0) {
  const limpio = camino.split('?')[0];
  const m = matchRoutes(RUTAS, limpio);
  if (!m) return null;
  const ultima = m[m.length - 1];
  if (ultima.route.path === '*') return null;
  if (Object.keys(ultima.params).length > 0) return null;
  const el = ultima.route.element;
  if (isValidElement(el) && el.type === Navigate) {
    if (saltos > 3) return null;
    return destino(String(el.props.to), saltos + 1);
  }
  return limpio;
}

// Las de `href` (TESTEO2, SUITE DASH) salen a OTRA compilación con recarga
// completa: no son rutas de esta aplicación y aquí no se pueden comprobar.
const entradasDelMenu = NAV_SECTIONS.flatMap((s) =>
  s.items.flatMap((it) => (it.children
    ? it.children.map((c) => ({ ...c, seccion: s.label, grupo: it.label }))
    : [{ ...it, seccion: s.label }])),
).filter((e) => !e.href);

describe('el menú de MultiCRM no lleva a «Página no encontrada»', () => {
  it('hay entradas que mirar (si esto falla, la prueba no está mirando nada)', () => {
    expect(entradasDelMenu.length).toBeGreaterThan(30);
  });

  it('cada entrada con dirección tiene su pantalla en App.jsx', () => {
    const rotas = entradasDelMenu
      .filter((e) => e.to && !e.comingSoon)
      .filter((e) => destino(e.to) === null)
      .map((e) => `${e.seccion} › ${e.label} (${e.to})`);
    expect(rotas).toEqual([]);
  });

  it('las «Próximamente» no tienen pantalla: si la tienen, sobra la marca', () => {
    const conPantalla = entradasDelMenu
      .filter((e) => e.comingSoon && destino(e.to) !== null)
      .map((e) => `${e.seccion} › ${e.label} (${e.to})`);
    expect(conPantalla).toEqual([]);
  });

  it('Google Ads está marcada como «Próximamente»', () => {
    const marcadas = entradasDelMenu.filter((e) => e.comingSoon).map((e) => e.to).sort();
    expect(marcadas).toEqual(['/google-ads']);
  });

  it('dentro de una misma sección, dos entradas no llevan a la misma pantalla', () => {
    const repetidas = [];
    for (const s of NAV_SECTIONS) {
      const vistas = new Map();
      const planas = s.items.flatMap((it) => it.children || [it]);
      for (const e of planas) {
        if (!e.to || e.href || e.comingSoon) continue;
        const d = destino(e.to);
        if (vistas.has(d)) repetidas.push(`${s.label}: «${vistas.get(d)}» y «${e.label}» → ${d}`);
        else vistas.set(d, e.label);
      }
    }
    expect(repetidas).toEqual([]);
  });

  it('el Dashboard de Finanzas lleva al dashboard de finanzas, no a Ventas', () => {
    const finanzas = NAV_SECTIONS.find((s) => s.label === 'Finanzas');
    const dashboard = finanzas.items.find((e) => e.label === 'Dashboard');
    expect(dashboard.to).toBe('/finanzas');
    expect(destino('/finanzas')).toBe('/finanzas');
  });

  it('cada redirección de App.jsx acaba en una pantalla que existe', () => {
    const redirecciones = [];
    const recorrer = (rutas) => {
      for (const r of rutas) {
        if (isValidElement(r.element) && r.element.type === Navigate && r.path && r.path !== '*') {
          redirecciones.push({ desde: r.path, a: String(r.element.props.to) });
        }
        if (r.children) recorrer(r.children);
      }
    };
    recorrer(RUTAS);
    expect(redirecciones.length).toBeGreaterThan(5);
    const rotas = redirecciones
      .filter((r) => !r.desde.includes(':'))
      .filter((r) => destino(r.a) === null)
      .map((r) => `${r.desde} → ${r.a}`);
    expect(rotas).toEqual([]);
  });
});

describe('«Próximamente» en el menú', () => {
  it('es una entrada atenuada, con su etiqueta y sin enlace', () => {
    const { container, getByText } = render(<EntradaProximamente label="Google Ads" icon={ChartBar} />);
    expect(getByText('Próximamente')).toBeTruthy();
    expect(getByText('Google Ads')).toBeTruthy();
    expect(container.querySelector('a')).toBeNull();
    expect(container.firstChild.getAttribute('aria-disabled')).toBe('true');
  });

  it('una entrada del menú marcada no navega, aunque tenga dirección', () => {
    // Era el fallo: `comingSoon` no se miraba y Google Ads salía como enlace.
    const { container } = render(
      <MemoryRouter>
        <NavItem to="/google-ads" label="Google Ads" icon={ChartBar} comingSoon />
      </MemoryRouter>,
    );
    expect(container.querySelector('a')).toBeNull();
    expect(container.textContent).toContain('Próximamente');
  });

  it('una entrada normal sí es un enlace', () => {
    const { container } = render(
      <MemoryRouter>
        <NavItem to="/meta-ads" label="Meta Ads" icon={ChartBar} />
      </MemoryRouter>,
    );
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/meta-ads');
  });
});
