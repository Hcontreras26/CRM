// CRM#1105 · El rol «Líder de equipo»: lo de una gestora y lo de su equipo, sin
// administración. El menú de verdad (NAV_SECTIONS), con los permisos que trae de
// serie en el catálogo del servidor; y «Cómo voy» con su puesto en su equipo.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { ASSIGNABLE_ROLES, ROLE_LABELS, ROLE_LABELS_CORTOS } from '@/modules/users/lib/usersUi';
import { ROLES_DE_GESTORA, esRolDeGestora } from '@/shared/lib/roles';
import { NOMBRE_DEL_ROL, CADA_DIA } from '@/shared/lib/recorridoGeneral';

vi.mock('@/contexts/ProjectContext', () => ({
  useProjectContext: () => ({ activeProject: { id: 1 }, activeIssuerId: null }),
}));
const respuestas = vi.hoisted(() => ({ puesto: null }));
vi.mock('@/shared/api/client', () => ({
  default: {
    get: vi.fn(async (url) => {
      if (url.startsWith('/informes/mi-puesto')) return { success: true, data: respuestas.puesto };
      return { success: true, data: null };
    }),
  },
}));

const { NAV_SECTIONS, canSeeItem, pasaPermisoDeRoles } = await import('@/shared/components/layout/Sidebar');
const { default: ComoVoy } = await import('@/modules/reports/components/ComoVoy');

afterEach(() => cleanup());

const can = (lista) => (k) => lista.includes(k);
function loQueVe(roles, user, permisos) {
  const c = can(permisos);
  const pasa = (item) => pasaPermisoDeRoles(item, c) && canSeeItem(item, roles, {}, 'crm', false, user, c);
  return NAV_SECTIONS.flatMap((s) => s.items).filter(pasa).flatMap((it) => (it.children ? it.children.filter(pasa) : [it]))
    .map((it) => it.to).filter(Boolean);
}

// Lo que trae de serie (catalogo.js del servidor): lo de la gestora y lo de equipo.
const GESTORA = ['leads.view', 'leads.create', 'leads.edit', 'leads.enviar_correo', 'leads.exportar_wasapi',
  'proceso.view', 'proceso.trabajar', 'convocatorias.view', 'convocatorias.ofrecer',
  'whatsapp.usar', 'whatsapp.cola', 'whatsapp.plantillas', 'ventas.view', 'ventas.registrar', 'ventas.metas',
  'email_sequences.view', 'email_sequences.lanzar', 'email_templates.view', 'forms.view', 'widget.view', 'widget.edit',
  'audiences.view', 'products.view', 'products.export', 'dossiers.view', 'tutores.avisar', 'accounting.por_cobrar',
  'conversions.view', 'conversions.create', 'conversions.edit', 'conversions.delete', 'conversions.cobros',
  'facturas.view', 'facturas.create', 'facturas.completar', 'facturas.enviar', 'facturas.cobrar', 'facturas.anular',
  'facturas.emitir_borrador', 'facturas.gestionar', 'facturas.editar_fechas', 'facturas.edit',
  'payroll.create', 'stripe.view', 'links_pago.crear', 'links_pago.cobro_automatico', 'reports.mis_informes',
  'feedback.view', 'feedback.enviar', 'reports_ia.view', 'ia.view', 'chat_ia.usar', 'clients.view', 'clients.create',
  'clients.edit', 'matriculas.view', 'matriculas.create', 'matriculas.edit', 'novedades.view', 'mensajes.usar',
  'accesos.pedir', 'change_requests.view', 'change_requests.create', 'change_requests.edit', 'change_requests.approve',
  'incidencias.view', 'documents.view', 'projects.view', 'channels.view', 'field_defs.view', 'installation.view',
  'cuenta.cambiar_correo'];
const LIDER = [...GESTORA, 'leads.assign', 'whatsapp.supervisar', 'ventas.view_equipo', 'reports.view', 'reports.puesto_ajeno', 'equipos.su_equipo',
  'conversions.reparto', 'reports.informe_mensual'];
const yo = { role: 'lider_equipo' };

describe('el rol en la pantalla de Usuarios', () => {
  it('se puede dar, con su nombre y lo que implica', () => {
    const r = ASSIGNABLE_ROLES.find((x) => x.value === 'lider_equipo');
    expect(r).toBeTruthy();
    expect(r.label).toBe('Líder de equipo');
    expect(r.hint).toMatch(/equipo/);
    expect(ROLE_LABELS.lider_equipo).toBe('Líder de equipo');
    expect(ROLE_LABELS_CORTOS.lider_equipo).toBe('Líder de equipo');
    expect(NOMBRE_DEL_ROL.lider_equipo).toBe('Líder de equipo');
    expect(CADA_DIA.lider_equipo).toMatch(/equipo/);
  });

  it('trabaja como una gestora', () => {
    expect(ROLES_DE_GESTORA).toEqual(['gestor', 'lider_equipo']);
    expect(esRolDeGestora('lider_equipo')).toBe(true);
    expect(esRolDeGestora('admin')).toBe(false);
  });
});

describe('menú · líder de equipo (CRM#1105)', () => {
  it('ve lo de una gestora: prospectos, la cola, ventas, su WhatsApp, por cobrar y sus preferencias', () => {
    const ve = loQueVe(['lider_equipo'], yo, LIDER);
    expect(ve).toEqual(expect.arrayContaining(['/prospectos', '/prospectos/cola', '/finanzas/ventas', '/whatsapp/chat',
      '/finanzas/por-cobrar', '/preferencias', '/novedades', '/incidencias']));
  });

  it('y lo de su equipo: Reportes y la actividad de WhatsApp', () => {
    const ve = loQueVe(['lider_equipo'], yo, LIDER);
    expect(ve).toEqual(expect.arrayContaining(['/informes', '/whatsapp/actividad']));
  });

  it('nada de administración', () => {
    const ve = loQueVe(['lider_equipo'], yo, LIDER);
    for (const no of ['/finanzas', '/finanzas/egresos', '/finanzas/por-pagar', '/finanzas/comisiones', '/finanzas/nominas',
      '/finanzas/facturas', '/finanzas/integraciones', '/finanzas/facturas-colaboradores', '/registro', '/correos',
      '/configuracion/claves', '/conexion/mcp', '/conexion/moodle', '/conexion/conectores', '/conexion/webhooks',
      '/conexion/asignacion-leads', '/tutores', '/productos/woocommerce', '/productos/categorias', '/tareas/configurar', '/prospectos/revision-duplicados']) {
      expect(ve, no).not.toContain(no);
    }
  });

  it('lo que la gestora ve por su rol, la líder también (misma lista)', () => {
    const gestora = loQueVe(['gestor'], { role: 'gestor' }, GESTORA);
    const lider = loQueVe(['lider_equipo'], yo, GESTORA);
    expect(lider).toEqual(gestora);
  });
});

describe('«Cómo voy» de la líder', () => {
  const cifras = (x = {}) => ({
    leads: 0, ventas: 0, vendido: 0, cobrado: 0, cobros: 0,
    cobrado_del_periodo: 0, cobrado_anteriores: 0, cobrado_en_cuotas: 0,
    ventas_anteriores: 0, anteriores_grandes: [], facturado: 0, pendiente: 0, tasa: 0, ...x,
  });

  it('la tabla de su equipo y, además, su puesto en él', async () => {
    respuestas.puesto = {
      puesto: 2, de: 3, nombre: 'Raquel', ...cifras({ leads: 20, ventas: 3, cobrado: 900, tasa: 15 }),
      tasa_equipo: 12, ventas_equipo: 9, cobrado_equipo: 3000, facturado_equipo: 0,
      faltan_para_subir: 300, mejor_cobrado: 1200, mejor_facturado: 0, mejor_ventas: 4,
      tabla: [
        { puesto: 1, user_id: 2, nombre: 'Fabiola', ...cifras({ leads: 30, ventas: 4, cobrado: 1200, tasa: 13.3 }) },
        { puesto: 2, user_id: 5, nombre: 'Raquel', ...cifras({ leads: 20, ventas: 3, cobrado: 900, tasa: 15 }) },
        { puesto: 3, user_id: 12, nombre: 'Malena', ...cifras({ leads: 25, ventas: 2, cobrado: 900, tasa: 8 }) },
      ],
      sin_gestora: null, total: null, lider: true,
    };
    render(<ComoVoy />);
    await waitFor(() => expect(screen.getByLabelText('Cómo va el equipo este mes')).toBeTruthy());
    const suyo = screen.getByTestId('como-voy-lider');
    expect((suyo.textContent || '').replace(/\s+/g, ' ')).toMatch(/Tú: puesto 2 de 3/);
  });

  it('a un admin sin equipo no le sale la línea de su puesto', async () => {
    respuestas.puesto = { ...respuestas.puesto, lider: false };
    render(<ComoVoy />);
    await waitFor(() => expect(screen.getByLabelText('Cómo va el equipo este mes')).toBeTruthy());
    expect(screen.queryByTestId('como-voy-lider')).toBeNull();
  });
});
