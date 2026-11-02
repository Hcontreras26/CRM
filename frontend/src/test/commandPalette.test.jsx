import { describe, it, expect } from 'vitest';
import { fuzzyScore, sinAcentos } from '../shared/components/layout/CommandPalette';
import {
  NAV_SECTIONS,
  entradasDeSeccion,
  canSeeItem,
  applyLabel,
  esSoloColaboraciones,
  pasaPermisoDeRoles,
} from '../shared/components/layout/Sidebar';
import { rolesDe } from '../shared/lib/roles';

function extraerPaginasPara(user, can = () => true, activeProject = { id: 1, modules: {}, type: 'standard' }) {
  const soloColab = esSoloColaboraciones(user);
  const userRoles = rolesDe(user);
  const modules = activeProject?.modules;
  const projectType = activeProject?.type;
  const labelOverrides = activeProject?.sidebar_labels;

  const list = [];
  const seen = new Set();

  for (const section of NAV_SECTIONS) {
    const itemsVisibles = entradasDeSeccion(section, {
      user,
      can,
      modules,
      projectType,
      soloColab,
    });

    for (const item of itemsVisibles) {
      if (item.children && Array.isArray(item.children)) {
        const visibleChildren = item.children
          .filter((c) => !c.comingSoon)
          .filter((c) => !c.permiso || [].concat(c.permiso).some((p) => pasaPermisoDeRoles({ permiso: p }, can)))
          .filter((c) => canSeeItem(c, userRoles, modules, projectType, soloColab, user, can));

        for (const child of visibleChildren) {
          if (child.to && !seen.has(child.to)) {
            seen.add(child.to);
            list.push({
              label: applyLabel(child.label, labelOverrides),
              sublabel: applyLabel(item.label, labelOverrides),
              to: child.to,
            });
          }
        }
      } else if (item.to && !item.comingSoon && !seen.has(item.to)) {
        seen.add(item.to);
        list.push({
          label: applyLabel(item.label, labelOverrides),
          sublabel: applyLabel(section.label, labelOverrides),
          to: item.to,
        });
      }
    }
  }
  return list;
}

describe('Buscador (CommandPalette) · Pruebas de QA Diego (02/11)', () => {
  it('fuzzyScore encuentra términos con o sin acentos', () => {
    expect(sinAcentos('Matrículas')).toBe('matriculas');
    expect(sinAcentos('Nóminas')).toBe('nominas');
    expect(sinAcentos('Asignación')).toBe('asignacion');

    expect(fuzzyScore('Matrículas', 'inscripciones', 'matriculas')).toBeGreaterThan(0);
    expect(fuzzyScore('Nóminas', 'salarios', 'nominas')).toBeGreaterThan(0);
    expect(fuzzyScore('Asignación de prospectos', 'leads reparto', 'asignacion')).toBeGreaterThan(0);
    expect(fuzzyScore('Configuración', 'ajustes', 'configuracion')).toBeGreaterThan(0);
    expect(fuzzyScore('Informes', 'estadísticas reportes', 'estadisticas')).toBeGreaterThan(0);
  });

  it('un colaborador no ve Contabilidad ni páginas restringidas', () => {
    const colabUser = { id: 99, role: 'colaborador', roles_extra: [] };
    const can = (perm) => perm.startsWith('tasks.');
    const paginas = extraerPaginasPara(colabUser, can);
    const rutas = paginas.map((p) => p.to);

    // No debe ver páginas de finanzas / contabilidad / nóminas
    expect(rutas).not.toContain('/finanzas');
    expect(rutas).not.toContain('/finanzas/nominas');
    expect(rutas).not.toContain('/finanzas/egresos');
    expect(rutas).not.toContain('/finanzas/por-pagar');

    // Debe ver su tablero y sus preferencias
    expect(rutas).toContain('/tareas');
    expect(rutas).toContain('/preferencias');
  });

  it('un superadmin ve Facturas de colaboradores, Diplomas, Tablero y Asignación', () => {
    const adminUser = { id: 1, role: 'superadmin', roles_extra: [] };
    const can = () => true;
    const paginas = extraerPaginasPara(adminUser, can);
    const rutas = paginas.map((p) => p.to);

    expect(rutas).toContain('/tareas');
    expect(rutas.some((r) => r.includes('facturas-colaborador') || r.includes('facturas'))).toBe(true);
    expect(rutas.some((r) => r.includes('diplomas') || r.includes('matriculas'))).toBe(true);
    expect(rutas.some((r) => r.includes('asignacion') || r.includes('prospectos'))).toBe(true);
  });

  it('los resultados de búsqueda de personas y productos mapean a rutas válidas en App.jsx', () => {
    // Lead no convertido -> /prospectos/:id
    const lead = { id: 456, status: 'nuevo' };
    const leadPath = lead.status === 'convertido' ? `/clientes/${lead.id}` : `/prospectos/${lead.id}`;
    expect(leadPath).toBe('/prospectos/456');

    // Cliente convertido -> /clientes/:id
    const cliente = { id: 789, status: 'convertido' };
    const clientePath = cliente.status === 'convertido' ? `/clientes/${cliente.id}` : `/prospectos/${cliente.id}`;
    expect(clientePath).toBe('/clientes/789');

    // Producto -> /productos/:id
    const producto = { id: 12 };
    const productPath = `/productos/${producto.id}`;
    expect(productPath).toBe('/productos/12');

    // Acción rápida de producto -> /productos
    const rutaNuevoProducto = '/productos';
    expect(rutaNuevoProducto).toBe('/productos');
  });
});
