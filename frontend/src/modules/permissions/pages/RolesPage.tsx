import { useEffect, useState } from 'react';
import { useProjectContext } from '@/contexts/ProjectContext';
import PageHeader from '@/shared/components/ui/PageHeader';
import { ShieldCheck, Plus, Lock, Warning, CheckCircle, Circle } from '@phosphor-icons/react';
import PestanaVista from '../components/PestanaVista';
import {
  FIXED_ROLES,
  PERMISSION_RESOURCES,
  ROLE_DEFAULT_PERMISSIONS,
} from '@/shared/hooks/usePermission';
import type { UserRole } from '@/shared/types';
import * as api from '../api/permissions.api';
import type { CustomRole, SystemDefaults } from '../api/permissions.api';
import { toast } from '@/shared/hooks/useToast';

// Los colores de un rol son IDENTIDAD, no semántica: quien lo crea elige uno
// para reconocerlo entre otros. Viven en `shared/lib/ui` junto a los de avatar,
// que es la misma excepción y el mismo sitio único.
import { ROLE_COLORS, type RoleColor } from '@/shared/lib/ui';

const COLOR_BG: Record<RoleColor, string> = ROLE_COLORS;

// Las cuatro acciones que llevan columna propia; el resto van a «Otros».
// Es el vocabulario del backend: `view`/`edit`, no `read`/`update`.
const COLUMNAS = ['view', 'create', 'edit', 'delete'];

// Nombre en castellano de cada accion. Cubre tambien las que no llevan columna
// (`export`, `assign`, `upload`…) porque en movil se listan igual.
const ACCION_ES: Record<string, string> = {
  view: 'Ver', create: 'Crear', edit: 'Editar', delete: 'Eliminar',
  export: 'Exportar', assign: 'Asignar', bulk_action: 'En bloque',
  upload: 'Subir', sync: 'Sincronizar',
};

interface RoleEntry {
  key: string;
  label: string;
  desc: string;
  color: RoleColor;
  custom?: CustomRole;
}

export default function RolesPage() {
  const { activeProject } = useProjectContext();
  const [selectedRole, setSelectedRole] = useState<string>('superadmin');
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [customRolesAvailable, setCustomRolesAvailable] = useState<boolean | null>(null);
  const [pestana, setPestana] = useState<'permisos' | 'vista'>('permisos');
  const [defaults, setDefaults] = useState<SystemDefaults | null>(null);

  // El catalogo del backend: recursos, acciones, widgets y elementos del menu.
  // Se pide una vez, no por rol.
  useEffect(() => {
    let cancelado = false;
    api.getSystemDefaults()
      .then((d) => { if (!cancelado) setDefaults(d); })
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    if (!activeProject?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const list = await api.listCustomRoles(activeProject.id);
        if (!cancelled) {
          setCustomRoles(list);
          setCustomRolesAvailable(true);
        }
      } catch {
        // 404 esperado si CRM-228 backend aun no esta desplegado
        if (!cancelled) setCustomRolesAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, [activeProject?.id]);

  const allRoles: RoleEntry[] = [
    ...FIXED_ROLES.map((r): RoleEntry => ({ key: r.key, label: r.label, desc: r.desc, color: r.color })),
    ...customRoles.map((r): RoleEntry => ({ key: `custom:${r.id}`, label: r.label, custom: r, color: 'amber', desc: r.description || '' })),
  ];
  const role = allRoles.find((r) => r.key === selectedRole);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Roles y Permisos"
        backTo="/configuracion"
        backLabel="Configuración"
        subtitle="Define qué puede hacer cada usuario según su rol"
        actions={
          <button
            disabled={customRolesAvailable !== true}
            onClick={() => toast({ title: 'Roles custom pendientes', description: 'CRM-228 backend en otra rama. Por ahora solo se pueden ver los 4 roles fijos.' })}
            title={customRolesAvailable === false ? 'Pendiente CRM-228 (backend)' : ''}
            aria-label="Crear rol custom"
            className="flex items-center gap-1.5 h-9 px-3 sm:px-4 rounded-xl bg-primary text-primary-foreground text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus size={14} weight="bold" /> <span className="hidden sm:inline">Crear rol custom</span>
          </button>
        }
      />

      {customRolesAvailable === false && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-warning/30 bg-warning-soft text-warning-soft-foreground">
          <Warning size={20} weight="bold" className="flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold">Roles custom no disponibles aún</p>
            <p className="text-xs mt-0.5 text-warning-soft-foreground">
              El backend de roles personalizados (CRM-228) está en otra rama y aún no se ha mergeado.
              Mientras tanto puedes ver los 4 roles fijos del sistema y la matriz de permisos por defecto.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4">
        {/* Panel izquierdo: lista de roles */}
        <aside className="space-y-2">
          <h3 className="text-xs font-bold uppercase text-muted-foreground px-1">Roles del sistema</h3>
          {FIXED_ROLES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setSelectedRole(r.key)}
              className={`w-full text-left p-3 rounded-xl border transition-colors flex items-start gap-3 ${
                selectedRole === r.key
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-card hover:bg-muted/50'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${COLOR_BG[r.color]}`}>
                <ShieldCheck size={16} weight="bold" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-sm">{r.label}</span>
                  <Lock size={10} className="text-muted-foreground" />
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{r.desc}</p>
              </div>
            </button>
          ))}

          {customRoles.length > 0 && (
            <>
              <h3 className="text-xs font-bold uppercase text-muted-foreground px-1 pt-3">Roles personalizados</h3>
              {customRoles.map((cr) => {
                const k = `custom:${cr.id}`;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSelectedRole(k)}
                    className={`w-full text-left p-3 rounded-xl border transition-colors flex items-start gap-3 ${
                      selectedRole === k ? 'border-primary bg-primary/5' : 'border-border bg-card hover:bg-muted/50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${COLOR_BG.emerald}`}>
                      <ShieldCheck size={16} weight="bold" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm">{cr.label}</p>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{cr.description || 'Hereda de ' + (cr.base_role || '—')}</p>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </aside>

        {/* Panel derecho: matriz de permisos del rol seleccionado */}
        <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
          {role ? (
            <>
              <header className="flex items-center justify-between gap-3 pb-3 border-b border-border">
                <div>
                  <h2 className="text-lg font-bold">{role.label}</h2>
                  <p className="text-xs text-muted-foreground">{role.desc}</p>
                </div>
                {!role.custom && (
                  <span className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md bg-muted font-bold">
                    <Lock size={10} /> Solo lectura
                  </span>
                )}
              </header>

              <nav className="flex items-center gap-1 -mt-1">
                {([['permisos', 'Permisos'], ['vista', 'Vista']] as const).map(([id, texto]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPestana(id)}
                    className={`h-8 px-3 rounded-lg text-sm font-semibold transition-colors ${
                      pestana === id ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {texto}
                  </button>
                ))}
              </nav>

              {pestana === 'vista' ? (
                <PestanaVista
                  roleKey={role.key}
                  esFijo={!role.custom}
                  customId={role.custom?.id}
                  defaults={defaults}
                />
              ) : (
              <>

              {/* Desktop table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-4 text-xs font-bold uppercase text-muted-foreground">Recurso</th>
                      <th className="text-center py-2 px-2 text-xs font-bold uppercase text-muted-foreground">Ver</th>
                      <th className="text-center py-2 px-2 text-xs font-bold uppercase text-muted-foreground">Crear</th>
                      <th className="text-center py-2 px-2 text-xs font-bold uppercase text-muted-foreground">Editar</th>
                      <th className="text-center py-2 px-2 text-xs font-bold uppercase text-muted-foreground">Eliminar</th>
                      <th className="text-center py-2 px-2 text-xs font-bold uppercase text-muted-foreground">Otros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PERMISSION_RESOURCES.map((res) => {
                      const perms = ROLE_DEFAULT_PERMISSIONS[role.key as UserRole] || {};
                      const all = perms['*'] === true;
                      const has = (a: string): boolean => all || perms[`${res.key}.${a}`] === true;
                      const others = res.actions.filter((a) => !COLUMNAS.includes(a));
                      return (
                        <tr key={res.key} className="border-b border-border last:border-0">
                          <td className="py-2 pr-4 font-medium">{res.label}</td>
                          {COLUMNAS.map((a) => (
                            <td key={a} className="py-2 px-2 text-center">
                              {res.actions.includes(a) ? (
                                has(a) ? (
                                  <CheckCircle size={16} weight="fill" className="inline text-success" />
                                ) : (
                                  <Circle size={16} className="inline text-muted-foreground/40" />
                                )
                              ) : (
                                <span className="text-muted-foreground/30">—</span>
                              )}
                            </td>
                          ))}
                          <td className="py-2 px-2 text-center text-[11px] text-muted-foreground">
                            {others.length === 0 ? '—' : others.map((a) => (
                              <span key={a} className={`inline-block px-1.5 mx-0.5 rounded ${has(a) ? 'bg-success/15 text-success-soft-foreground' : 'bg-muted/40'}`}>
                                {a}
                              </span>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {PERMISSION_RESOURCES.map((res) => {
                  const perms = ROLE_DEFAULT_PERMISSIONS[role.key as UserRole] || {};
                  const all = perms['*'] === true;
                  const has = (a: string): boolean => all || perms[`${res.key}.${a}`] === true;
                  const others = res.actions.filter((a) => !COLUMNAS.includes(a));
                  return (
                    <div key={res.key} className="bg-muted/30 border border-border rounded-lg p-3">
                      <p className="text-sm font-semibold mb-2">{res.label}</p>
                      <div className="grid grid-cols-2 gap-y-1 gap-x-3 text-[11px]">
                        {COLUMNAS.map((a) => (
                          <div key={a} className="flex items-center gap-1.5">
                            {res.actions.includes(a) ? (
                              has(a) ? (
                                <CheckCircle size={14} weight="fill" className="text-success flex-shrink-0" />
                              ) : (
                                <Circle size={14} className="text-muted-foreground/40 flex-shrink-0" />
                              )
                            ) : (
                              <span className="text-muted-foreground/30 w-3.5 text-center">—</span>
                            )}
                            <span className="text-muted-foreground">{ACCION_ES[a] || a}</span>
                          </div>
                        ))}
                      </div>
                      {others.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-border/50 flex flex-wrap gap-1">
                          {others.map((a) => (
                            <span key={a} className={`inline-block px-1.5 py-0.5 rounded text-[10px] ${has(a) ? 'bg-success/15 text-success-soft-foreground' : 'bg-muted/40 text-muted-foreground'}`}>
                              {a}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <p className="text-[11px] text-muted-foreground italic pt-2">
                Los permisos de los cuatro roles del sistema viven en el backend y no se tocan desde aqui.
                Esta tabla es el espejo de lo que manda, y una prueba se encarga de que no se desvie.
              </p>
              </>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-12">Selecciona un rol para ver su matriz de permisos.</p>
          )}
        </section>
      </div>
    </div>
  );
}
