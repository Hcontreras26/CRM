import { describe, it, expect } from 'vitest';
import { isValidElement } from 'react';
import { Routes, Navigate, createRoutesFromChildren, matchRoutes } from 'react-router-dom';
import App from '@/App';
import { NAV_SECTIONS } from '@/shared/components/layout/Sidebar';
import { TABS, SIN_SUBMENU } from '@/modules/accounting/pages/FinanzasLayout';

/*
  #79 punto 3 (Diego, 27/10): quitar el submenú de Ventas «sin perder ninguna
  entrada ni ruta», con «una que compruebe que las rutas siguen vivas».

  Cada entrada del submenú de Finanzas tiene que seguir teniendo su pantalla en
  App.jsx, y desde Ventas —donde ya no sale el submenú— seguir a un clic: en el
  menú lateral o, las que no están en él («Análisis de ventas» y «Sin
  formación», #41), en la cabecera de Ventas. Las rutas salen del propio App.jsx, como en `menuSinRutasRotas`.
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

/** Si la dirección tiene pantalla (no cae en el `*` ni solo en una ruta con `:id`). */
function tienePantalla(camino, saltos = 0) {
  const m = matchRoutes(RUTAS, camino);
  if (!m) return false;
  const ultima = m[m.length - 1];
  if (ultima.route.path === '*' || Object.keys(ultima.params).length > 0) return false;
  const el = ultima.route.element;
  if (isValidElement(el) && el.type === Navigate) return saltos < 3 && tienePantalla(String(el.props.to), saltos + 1);
  return true;
}

const enElMenu = new Set(NAV_SECTIONS.flatMap((s) => s.items.flatMap((it) => it.children || [it])).map((e) => e.to));

describe('el submenú de Finanzas, quitado de Ventas sin perder nada', () => {
  it('hay entradas que mirar (si esto falla, la prueba no está mirando nada)', () => {
    expect(TABS.length).toBeGreaterThan(10);
    expect(SIN_SUBMENU).toContain('/finanzas/ventas');
  });

  it('cada entrada del submenú sigue teniendo su pantalla', () => {
    const muertas = TABS.filter((t) => !tienePantalla(t.to)).map((t) => `${t.label} (${t.to})`);
    expect(muertas).toEqual([]);
  });

  it('desde Ventas, cada entrada sigue a un clic: en el menú lateral o, la que no está, en la cabecera', () => {
    // Las de la cabecera las comprueba ventasCabecera79.test.jsx pintando la
    // pantalla: aquí solo se fija cuáles son, para que no se cuele otra.
    const fueraDelMenu = TABS.filter((t) => !enElMenu.has(t.to)).map((t) => t.to);
    expect(fueraDelMenu).toEqual(['/finanzas/ventas-analisis', '/finanzas/ventas-sin-formacion']);
  });
});
