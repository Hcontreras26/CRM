// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import fs from 'fs';
import path from 'path';

/*
  #941, segunda tanda (Diego, 19/11): «Ver recorrido» en el bloque Finanzas, en
  el orden de la issue. La primera tanda trajo Dashboard, Ingresos, Conversiones
  y Egresos; la segunda, Cuentas por cobrar, Cuentas por pagar, Comisiones y
  Comisiones de tutores; la tercera, la última, Nóminas, Pendientes de
  facturar, Sin formación y Análisis de ventas. Cada pantalla tiene el suyo,
  con el permiso de la pantalla, y sale solo la primera vez.

  Se comprueba que están los doce, que cada pantalla ofrece el suyo, y se
  pintan las doce de verdad con datos en los que sale todo para recorrerlas
  enteras sin saltarse ningún paso. Que cada anclaje sigue en el código de su
  pantalla y que los permisos existen lo comprueba `recorridosCobros.test.jsx`
  (estos se suman a `RECORRIDOS_COBROS`); que el cartel cabe a 375 px, paso a
  paso, `recorridoEnMovil.test.jsx`.
*/

const { permisos, api, ambito, rol } = vi.hoisted(() => ({
  permisos: new Set(),
  api: { get: vi.fn() },
  ambito: { current: null },
  // Comisiones enseña «Reglas» solo al superadmin.
  rol: { current: 'admin' },
}));

vi.mock('@/shared/api/client', () => ({ default: { get: (...a) => api.get(...a), post: vi.fn(), patch: vi.fn() } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 41, role: rol.current } }) }));
vi.mock('@/contexts/ProjectContext', () => ({ useProjectContext: () => ambito.current }));
vi.mock('@/shared/hooks/usePermission', () => ({ default: () => ({ can: (k) => permisos.has(k) }) }));

const { RECORRIDOS_FINANZAS } = await import('@/shared/lib/recorridosFinanzas');
const { RECORRIDOS_COBROS, claveRecorrido } = await import('@/shared/lib/recorridosCobros');
const { default: RevenuePage } = await import('@/modules/revenue/pages/RevenuePage');
const { default: ExpensesPage } = await import('@/modules/expenses/pages/ExpensesPage');
const { default: AccountingDashboardPage } = await import('@/modules/accounting/pages/AccountingDashboardPage');
const { default: IncomePage } = await import('@/modules/accounting/pages/IncomePage');
const { default: ReceivablePage } = await import('@/modules/accounting/pages/ReceivablePage');
const { default: AccountsPayablePage } = await import('@/modules/accounting/pages/AccountsPayablePage');
const { default: CommissionsPage } = await import('@/modules/commissions/pages/CommissionsPage');
const { default: ComisionesTutoresPage } = await import('@/modules/tutores/pages/ComisionesTutoresPage');
const { default: PayrollPage } = await import('@/modules/payroll/pages/PayrollPage');
const { default: PendienteFacturarPage } = await import('@/modules/accounting/pages/PendienteFacturarPage');
const { default: VentasSinFormacionPage } = await import('@/modules/sales/pages/VentasSinFormacionPage');
const { default: SalesAnalysisPage } = await import('@/modules/sales/pages/SalesAnalysisPage');

const SRC = path.resolve(__dirname, '..');
const n0 = { n: 0, importe: 0 };
const HOY = new Date().toISOString().slice(0, 10);

/** Lo que contesta el servidor, por ruta (sin la consulta). */
const RESPUESTAS = {
  // Conversiones e Ingresos piden las dos /conversions.
  '/conversions': {
    success: true,
    data: [{ id: 10, lead_id: 5, lead_nombre: 'Ana Pérez', producto_contratado: 'Máster', importe_total: 1000, importe_pagado: 500, tipo_pago: 'abono_parcial', fecha_conversion: new Date().toISOString().slice(0, 10) }],
    pagination: { total: 1 },
    totales: {
      importe: 1000, pagado: 500, pendiente: 500, iva: 0,
      facturadas: 0, sinFactura: 1, noRequiereFactura: 0, pendientesDeFacturar: 1,
      facturasDeAntes: { n: 2, importe: 300 }, facturadoEnPeriodo: { n: 2, importe: 300 },
      cobrosDelPeriodo: { matricula: n0, cuotas: n0 },
      facturasPorClase: { venta: n0, cuota: { n: 2, importe: 300 }, parte: n0, suelta: n0 },
      porProyecto: [{ project_id: 1, nombre: 'Campus de prueba', ventas: { n: 1, importe: 1000 }, cuotas: { n: 2, importe: 300 } }],
      cobradoDeMas: n0,
    },
  },
  '/conversions/filas': {
    success: true,
    data: [{ tipo: 'venta', clave_id: 10, fecha: '2026-11-10', lead_id: 5, venta_id: 10, cliente: 'Ana Pérez', producto: 'Máster', total: 1000, pagado: 500 }],
    pagination: { total: 1 },
  },
  '/conversions/productos': { success: true, data: [] },
  '/ventas/my-stats': { success: true, data: { user_id: 41, ventas: 1, cobrado: 500, meta_ventas: 3, meta_facturacion: null, progreso_ventas_pct: 33 } },
  '/ventas/top-products': { success: true, data: [{ producto: 'Máster', ventas: 1, importe: 1000 }] },
  '/expenses': {
    success: true,
    data: [{ id: 7, fecha: '2026-11-05', concepto: 'Licencia de software', categoria: 'software', importe: 120, project_id: 1, proyecto_nombre: 'Campus de prueba', origen: 'manual' }],
    pagination: { total: 1 },
  },
  '/expenses/resumen': {
    success: true,
    data: { num: 1, total: 120, sin_campus: { num: 0, total: 0 }, por_categoria: [{ categoria: 'software', num: 1, total: 120 }] },
  },
  '/accounting/dashboard': {
    success: true,
    data: {
      ingresos: { total_cobrado: 500, total_emitido: 300, num_facturas: 2 },
      egresos: { total: 120, por_categoria: [{ categoria: 'software', total: 120 }] },
      balance: 380,
      cuentas_por_cobrar: [{ conversion_id: 10, lead_id: 5, lead_nombre: 'Ana Pérez', producto_contratado: 'Máster', importe_total: 1000, importe_pagado: 500, importe_pendiente: 500, fecha_vencimiento: '2026-12-01' }],
      cuentas_por_cobrar_resumen: { num: 1, total: 500, num_vencido: 0, total_vencido: 0 },
      trend: { ingresos: [{ mes: '2026-11', total: 500 }], egresos: [{ mes: '2026-11', total: 120 }] },
    },
  },
  '/informes/ventas-vendedora': { success: true, data: [{ gestor_id: 41, gestor_nombre: 'Marta', ventas: 1, clientes: 1, importe: 1000, cobrado: 500, pendiente: 500 }] },
  // Segunda tanda.
  '/accounting/receivable': {
    success: true,
    data: {
      items: [{ tipo: 'cuota', ref_id: 3, conversion_id: 10, lead_id: 5, cliente: 'Ana Pérez', cliente_email: null, producto: 'Máster', project_id: 1, proyecto_nombre: 'Campus de prueba', responsable_id: 41, gestora_nombre: 'Marta', cuota_numero: 2, importe: 500, vence: HOY, vencido: false }],
      gestoras: [{ id: 41, nombre: 'Marta' }],
      resumen: { total_pendiente: 500, total_vencido: 0, count: 1, count_vencidas: 0 },
    },
  },
  '/accounts-payable': {
    success: true,
    data: [{ id: 4, proveedor: 'Proveedor de prueba', concepto: 'Alojamiento web', importe_total: 200, importe_pagado: 50, fecha_compromiso_pago: '2026-12-01', status: 'partial' }],
  },
  '/accounts-payable/stats': { success: true, data: { total_facturado: 200, total_pagado: 50, total_pendiente: 150, vencidas: 0 } },
  '/commissions': {
    success: true,
    data: [{ id: 8, created_at: HOY, user_id: 41, user_nombre: 'Marta', lead_nombre: 'Ana Pérez', producto_contratado: 'Máster', importe_base: 500, pct: 10, importe_comision: 50, estado: 'pendiente' }],
  },
  '/commissions/stats': { success: true, data: { total: 50, pagado: 0, pendiente: 50, cantidad: 1 } },
  '/users': { success: true, data: { users: [{ id: 41, nombre: 'Marta', role: 'gestor' }] } },
  '/tutores/comisiones/resumen': { success: true, data: [{ periodo: HOY.slice(0, 7), tutor_id: 9, tutor: 'Luis Tutor', tutor_email: 'luis@example.com', pendiente: 30, pagada: 0, base: 300 }] },
  '/tutores/comisiones': { success: true, data: [] },
  '/tutores/ajustes': { success: true, data: { aplica_desde: '2026-01-01', pct_por_defecto: 10 } },
  '/tutores/pagos-sin-formacion': { success: true, data: [{ venta: 12, alumno: 'Pepe Alumno', importe: 100 }] },
  // Tercera tanda.
  '/payroll/plans': {
    success: true,
    data: [{ id: 1, user_id: 41, user_nombre: 'Marta', user_email: 'marta@example.com', modo_fijo: 1200, modo_horas: '', modo_comisiones: true, active: true }],
  },
  '/ventas/sin-formacion': {
    success: true,
    data: {
      filas: [
        { id: 12, fecha: HOY, alumno: 'Pepe Alumno', alumnoEmail: null, texto: 'Máster en Psicología', importe: 100, cobrado: 100, sugerencia: { id: 3, nombre: 'Máster en Psicología' } },
        { id: 13, fecha: HOY, alumno: 'Eva Alumna', alumnoEmail: null, texto: null, importe: 80, cobrado: 80, sugerencia: null },
      ],
      total: 2, conSugerencia: 1, sinTexto: 1, importe: 180, cobrado: 180,
    },
  },
  '/ventas/resumen': {
    success: true,
    data: {
      ventas: 3, clientes: 2, asesoras: 1, importe: 3000, cobrado: 3100, pendiente: 400,
      liquidadas: 1, con_saldo: 1, ticket_medio: 1000,
      cobrado_de_mas: { ventas: 1, importe: 500 },
      cuotas: { ventas_con_plan: 1, total: 4, cobradas: 2, pendientes: 2, vencidas: 1, importe_pendiente: 400, importe_vencido: 200 },
    },
  },
  '/ventas/por-asesora': {
    success: true,
    data: [{ user_id: 41, nombre: 'Marta Asesora', email: null, role: 'gestor', ventas: 3, clientes: 2, importe: 3000, cobrado: 3100, pendiente: 400, ticket_medio: 1000, ultima_venta: HOY }],
  },
  '/ventas/por-cliente': {
    success: true,
    data: [{
      lead_id: 7, cliente: 'Carla Cliente', email: null, telefono: null, ventas: 2, importe: 2000, cobrado: 1600, pendiente: 400,
      primera_venta: HOY, ultima_venta: HOY, cuotas_pendientes: 2, cuotas_vencidas: 1, cuotas_importe_pendiente: 400, asesoras: 'Marta Asesora',
    }],
    pagination: { total: 1 },
  },
};

/** Pendientes de facturar pide /conversions con `pendingBilling`: ventas sin
 *  importe, y más de una página (50) para que salga «Más páginas». */
const SIN_IMPORTE = {
  success: true,
  data: [{ id: 21, lead_id: 6, lead_nombre: 'Luis Sinprecio', producto_contratado: 'Experto', importe_total: 0, importe_pagado: 0, fecha_conversion: HOY }],
  pagination: { total: 60 },
};
/** Nóminas pide /users?incluirTodos=true y espera la lista tal cual. */
const USUARIOS_NOMINAS = { success: true, data: [{ id: 41, nombre: 'Marta' }, { id: 42, nombre: 'Rosa Sinplan' }] };

function responder(url) {
  const u = String(url);
  if (ruta(u) === '/conversions' && u.includes('pendingBilling=true')) return SIN_IMPORTE;
  if (ruta(u) === '/users' && u.includes('incluirTodos=true')) return USUARIOS_NOMINAS;
  return RESPUESTAS[ruta(u)] ?? { success: true, data: null };
}

const ruta = (url) => String(url).split('?')[0];

function pintar(Pantalla, props = {}) {
  return render(<MemoryRouter><Pantalla {...props} /></MemoryRouter>);
}

/** Recorre el recorrido abierto pulsando «Siguiente» y devuelve los títulos vistos. */
function recorrer(n) {
  const vistos = [];
  for (let i = 0; i < n + 2; i++) {
    const titulo = document.getElementById('recorrido-titulo');
    vistos.push(titulo.textContent);
    // El del cartel: la pantalla puede tener su propio «Siguiente» (las páginas).
    const sig = within(titulo.closest('[role="dialog"]')).queryByRole('button', { name: /Siguiente/ });
    if (!sig) break;
    fireEvent.click(sig);
  }
  return vistos;
}

beforeEach(() => {
  localStorage.clear();
  permisos.clear();
  rol.current = 'admin';
  ambito.current = {
    activeProject: { id: 1, nombre: 'Campus de prueba' },
    activeIssuer: null, activeIssuerId: null,
    projects: [{ id: 1, nombre: 'Campus de prueba', sociedad_emisora_id: 3, sociedad_nombre: 'Empresa de prueba' }],
    switchProject: vi.fn(), switchIssuer: vi.fn(),
  };
  api.get.mockReset();
  api.get.mockImplementation(async (url) => responder(url));
});
afterEach(() => cleanup());

describe('los recorridos del bloque Finanzas (#941)', () => {
  it('son los doce de las tres tandas, en el orden de la issue, y están registrados con los demás', () => {
    expect(Object.keys(RECORRIDOS_FINANZAS)).toEqual([
      'finanzas-dashboard', 'ingresos', 'conversiones', 'egresos',
      'por-cobrar', 'por-pagar', 'comisiones', 'comisiones-tutores',
      'nominas', 'pendientes-facturar', 'ventas-sin-formacion', 'analisis-ventas',
    ]);
    for (const id of Object.keys(RECORRIDOS_FINANZAS)) expect(RECORRIDOS_COBROS[id]).toBe(RECORRIDOS_FINANZAS[id]);
    // Fuera, a propósito: lo de Diego y Claude, y Ventas, que ya estaba.
    for (const fuera of ['facturas', 'links-pago', 'pagos-stripe', 'disputas-stripe', 'integraciones-stripe', 'conciliacion', 'ventas']) {
      expect(RECORRIDOS_FINANZAS[fuera]).toBeUndefined();
    }
  });

  it.each(Object.values(RECORRIDOS_FINANZAS).map((r) => [r.id, r]))('%s: de 5 a 8 pasos, con permiso, y su pantalla lo ofrece', (id, r) => {
    expect(r.pasos.length).toBeGreaterThanOrEqual(5);
    expect(r.pasos.length).toBeLessThanOrEqual(8);
    expect(r.permiso).toBeTruthy();
    // Los pasos que señalan algo son la mayoría: no es un texto con «Siguiente».
    expect(r.pasos.filter((p) => p.donde).length).toBeGreaterThanOrEqual(r.pasos.length - 2);
    const codigo = fs.readFileSync(path.join(SRC, r.pantalla[0]), 'utf8');
    expect(codigo).toMatch(new RegExp(`<VerRecorrido id="${id}"`));
    // Margen de scroll: lo señalado no queda debajo de la barra fija de arriba.
    expect(codigo).toContain('[&_[data-recorrido]]:scroll-mt-40');
  });
});

/** Desde la #1012 ninguno sale solo: se abre con su botón. */
const abrir = async (id) => {
  fireEvent.click(await screen.findByRole('button', { name: `Ver recorrido: ${RECORRIDOS_FINANZAS[id].titulo}` }, { timeout: 3000 }));
};

describe('pintadas de verdad, se recorren enteras sin saltarse ningún paso', () => {
  // [id, pantalla, props, permisos, lo que se ve al cargar, pasos que se saltan]
  const CASOS = [
    ['conversiones', RevenuePage, {}, ['conversions.view'], 'Conversiones Recientes', []],
    ['egresos', ExpensesPage, {}, ['expenses.view', 'expenses.create'], 'Licencia de software', []],
    ['finanzas-dashboard', AccountingDashboardPage, {}, ['accounting.view'], 'Ventas por vendedora', []],
    ['ingresos', IncomePage, { title: 'Ingresos' }, ['conversions.view'], 'Mi meta del mes', []],
    // Abre en la lista: el paso del calendario no tiene dónde ir y se salta.
    ['por-cobrar', ReceivablePage, {}, ['accounting.por_cobrar'], 'Ana Pérez', ['El calendario']],
    ['por-pagar', AccountsPayablePage, {}, ['accounts_payable.view', 'accounts_payable.create'], 'Proveedor de prueba', []],
    ['comisiones', CommissionsPage, {}, ['commissions.view', 'commissions.reglas', 'commissions.pagar'], 'Ana Pérez', []],
    ['comisiones-tutores', ComisionesTutoresPage, {}, ['tutores.gestionar', 'tutores.liquidar', 'tutores.avisar'], 'Luis Tutor', []],
    // Con una empresa elegida, para que salga también «elige un campus».
    ['nominas', PayrollPage, {}, ['payroll.view', 'payroll.edit'], 'marta@example.com', []],
    ['pendientes-facturar', PendienteFacturarPage, {}, ['facturas.view'], 'Luis Sinprecio', []],
    ['ventas-sin-formacion', VentasSinFormacionPage, {}, ['ventas.view_equipo'], 'Eva Alumna', []],
    // Abre en el resumen: la tabla de «Por asesora» y «Por cliente» no está y su paso se salta.
    ['analisis-ventas', SalesAnalysisPage, {}, ['ventas.view_equipo'], 'Cobro fraccionado', ['Por asesora o por cliente']],
  ];

  it.each(CASOS)('%s: no sale solo (#1012); con «Ver recorrido» pasa por todos sus pasos', async (id, Pantalla, props, conPermisos, cargada, saltados) => {
    for (const p of conPermisos) permisos.add(p);
    if (id === 'comisiones') rol.current = 'superadmin';
    // Con una empresa elegida, Ingresos enseña además el reparto «Por proyecto».
    if (id === 'ingresos') {
      ambito.current = { ...ambito.current, activeIssuer: { id: 3, nombre: 'Empresa de prueba' }, activeIssuerId: 3 };
    }
    if (id === 'nominas') {
      ambito.current = {
        ...ambito.current,
        activeProject: { id: -1, nombre: 'Empresa de prueba' },
        activeIssuer: { id: 3, nombre: 'Empresa de prueba' }, activeIssuerId: 3,
      };
    }
    pintar(Pantalla, props);
    await screen.findAllByText(cargada, {}, { timeout: 5000 });
    const titulos = RECORRIDOS_FINANZAS[id].pasos.map((p) => p.titulo).filter((t) => !saltados.includes(t));
    await new Promise((r) => setTimeout(r, 900));
    expect(screen.queryByRole('dialog', { name: titulos[0] })).toBeNull();
    await abrir(id);
    await screen.findByRole('dialog', { name: titulos[0] }, { timeout: 3000 });
    expect(localStorage.getItem(claveRecorrido(id, 41))).toBe('1');
    expect(recorrer(titulos.length)).toEqual(titulos);
    fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
    expect(screen.queryByRole('dialog', { name: /./ })).toBeNull();
  });

  it('Ingresos tiene el suyo, no el de Ventas (es la misma pantalla con otro título)', async () => {
    permisos.add('conversions.view');
    permisos.add('ventas.view');
    localStorage.setItem(claveRecorrido('ingresos', 41), '1');
    pintar(IncomePage, { title: 'Ingresos' });
    expect(await screen.findByRole('button', { name: 'Ver recorrido: Ingresos' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver recorrido: Ventas' })).toBeNull();
  });

  it('«Atrás» vuelve, Escape cierra y el recorrido cuelga del body', async () => {
    permisos.add('conversions.view');
    localStorage.setItem(claveRecorrido('conversiones', 41), '1');
    pintar(RevenuePage);
    await screen.findAllByText('Conversiones Recientes', {}, { timeout: 5000 });
    const boton = screen.getByRole('button', { name: 'Ver recorrido: Conversiones' });
    fireEvent.click(boton);
    fireEvent.click(screen.getByRole('button', { name: /Siguiente/ }));
    const cartel = screen.getByRole('dialog', { name: 'Este mes' });
    expect(cartel.closest('.fixed.inset-0').parentElement).toBe(document.body);
    expect(boton.parentElement.contains(cartel)).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Atrás/ }));
    expect(screen.getByRole('dialog', { name: 'Las conversiones' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Las conversiones' })).toBeNull();
  });

  it('Cuentas por cobrar en el calendario: señala el calendario y se salta la lista', async () => {
    permisos.add('accounting.por_cobrar');
    localStorage.setItem(claveRecorrido('por-cobrar', 41), '1');
    pintar(ReceivablePage);
    await screen.findAllByText('Ana Pérez', {}, { timeout: 5000 });
    fireEvent.click(screen.getByRole('button', { name: /Calendario/ }));
    await waitFor(() => expect(document.querySelector('[data-recorrido="cobrar-calendario"]')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Ver recorrido: Cuentas por cobrar' }));
    const titulos = RECORRIDOS_FINANZAS['por-cobrar'].pasos.map((p) => p.titulo).filter((t) => t !== 'La lista');
    expect(recorrer(titulos.length)).toEqual(titulos);
  });

  it('Comisiones de tutores: sin liquidar ni avisar, el paso «Pagar y avisar» no sale', async () => {
    permisos.add('tutores.gestionar');
    pintar(ComisionesTutoresPage);
    await screen.findAllByText('Luis Tutor', {}, { timeout: 5000 });
    await abrir('comisiones-tutores');
    await screen.findByRole('dialog', { name: 'Lo que se debe a los tutores' }, { timeout: 3000 });
    const vistos = recorrer(RECORRIDOS_FINANZAS['comisiones-tutores'].pasos.length);
    expect(vistos).not.toContain('Pagar y avisar');
    expect(vistos).toContain('Los tutores');
  });

  it('Nóminas con un campus: no hay aviso de «elige un campus» y ese paso se salta', async () => {
    permisos.add('payroll.view');
    pintar(PayrollPage);
    await screen.findAllByText('marta@example.com', {}, { timeout: 5000 });
    await abrir('nominas');
    await screen.findByRole('dialog', { name: 'Las nóminas' }, { timeout: 3000 });
    const vistos = recorrer(RECORRIDOS_FINANZAS.nominas.pasos.length);
    expect(vistos).not.toContain('Con una empresa elegida');
    // Sin `payroll.edit`, tampoco «Añadir un plan».
    expect(vistos).not.toContain('Añadir un plan');
    expect(vistos).toEqual(['Las nóminas', 'Las pestañas', 'Los planes', 'Y listo']);
  });

  it.each([
    ['Por asesora', 'Marta Asesora'],
    ['Por cliente', 'Carla Cliente'],
  ])('Análisis de ventas en «%s»: señala la tabla y se salta lo que es del resumen', async (vista, nombre) => {
    permisos.add('ventas.view_equipo');
    localStorage.setItem(claveRecorrido('analisis-ventas', 41), '1');
    pintar(SalesAnalysisPage);
    await screen.findAllByText('Cobro fraccionado', {}, { timeout: 5000 });
    // En el resumen no hay tabla: «Por asesora o por cliente» no tiene dónde ir.
    expect(document.querySelector('[data-recorrido="analisis-tabla"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: new RegExp(vista) }));
    await screen.findAllByText(nombre, {}, { timeout: 5000 });
    expect(document.querySelectorAll('[data-recorrido="analisis-tabla"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Ver recorrido: Análisis de ventas' }));
    const fuera = ['El resumen', 'Cobrado de más', 'Cobro fraccionado'];
    const titulos = RECORRIDOS_FINANZAS['analisis-ventas'].pasos.map((p) => p.titulo).filter((t) => !fuera.includes(t));
    expect(titulos).toContain('Por asesora o por cliente');
    expect(recorrer(titulos.length)).toEqual(titulos);
  });

  it('Pendientes de facturar: «Cuántas son» va aparte y «La lista» envuelve la tabla y las tarjetas, no las páginas', async () => {
    permisos.add('facturas.view');
    localStorage.setItem(claveRecorrido('pendientes-facturar', 41), '1');
    pintar(PendienteFacturarPage);
    await screen.findAllByText('Luis Sinprecio', {}, { timeout: 5000 });
    const lista = document.querySelector('[data-recorrido="pendientes-lista"]');
    const cuantas = document.querySelector('[data-recorrido="pendientes-cuantas"]');
    expect(cuantas.textContent).toContain('60');
    expect(lista.contains(cuantas)).toBe(false);
    expect(lista.contains(document.querySelector('[data-recorrido="pendientes-paginas"]'))).toBe(false);
    expect(lista.querySelector('table')).not.toBeNull();
    expect(within(lista).getAllByText('Luis Sinprecio')).toHaveLength(2); // tabla (PC) y tarjeta (móvil)
  });

  it('ya visto, no vuelve a salir solo', async () => {
    permisos.add('expenses.view');
    localStorage.setItem(claveRecorrido('egresos', 41), '1');
    pintar(ExpensesPage);
    await screen.findAllByText('Licencia de software', {}, { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 1200));
    expect(screen.queryByRole('dialog', { name: 'Los egresos' })).toBeNull();
  });

  it('sin el permiso de la pantalla, ni botón ni recorrido', async () => {
    permisos.add('ventas.view'); // otro permiso cualquiera: no el de Egresos
    pintar(ExpensesPage);
    await screen.findAllByText('Licencia de software', {}, { timeout: 5000 });
    await new Promise((r) => setTimeout(r, 1200));
    expect(screen.queryByRole('button', { name: /Ver recorrido/ })).toBeNull();
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Los egresos' })).toBeNull());
  });
});
