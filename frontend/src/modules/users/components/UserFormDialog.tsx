import { useState } from 'react';
import { X, Key, Info, Lock } from '@phosphor-icons/react';
import type { Project, UserRole } from '@/shared/types';
import Portal from '@/shared/components/ui/portal';
import Select from '@/shared/components/ui/Select';
import { avatarColorFor, getInitials, inputClass } from '@/shared/lib/ui';
import { toast } from '@/shared/hooks/useToast';
import type { AvisoCambioCorreo, CrmUser, ProjectAssignment } from '../api/users.api';
import { ASSIGNABLE_ROLES } from '../lib/usersUi';
import { confirmacionCambioCorreo, problemaDeContrasena } from '../lib/credenciales';
import ProjectSelector from './ProjectSelector';

export interface UserFormValues {
  nombre: string;
  email: string;
  role: UserRole;
  /** Roles de MAS. Quien lleva prospectos y ademas da clase no tiene que elegir. */
  roles_extra: UserRole[];
  projects: ProjectAssignment[];
  whatsapp_phone: string;
  factura_manager: boolean;
  editar_fechas_factura: boolean;
  usa_whatsapp: boolean;
  /** Con un correo nuevo: mandarle el enlace para poner contraseña allí (#246). */
  reenviarEnlace: boolean;
}

interface Props {
  /** null = alta. Con usuario = edicion. */
  user: CrmUser | null;
  projects: Project[];
  /** El cambio de contraseña solo lo puede hacer un superadmin. */
  canResetPassword: boolean;
  /** Y el del correo, también solo él (#248). */
  canChangeEmail: boolean;
  /** Antes de guardar un correo nuevo: si recibe prospectos por Make (#248). */
  onCheckEmail: () => Promise<AvisoCambioCorreo | null>;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: UserFormValues) => void | Promise<void>;
  onResetPassword: (password: string, repetida: string) => Promise<void>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function UserFormDialog({
  user, projects, canResetPassword, canChangeEmail, loading, onClose, onSubmit, onCheckEmail, onResetPassword,
}: Props) {
  const esEdicion = !!user;

  const [nombre, setNombre] = useState(user?.nombre ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [reenviarEnlace, setReenviarEnlace] = useState(false);
  const cambiaCorreo = esEdicion && canChangeEmail && email.trim().toLowerCase() !== user!.email.toLowerCase();
  const [role, setRole] = useState<UserRole>((user?.role as UserRole) ?? 'gestor');
  // Los roles añadidos. Diego, 22/09: «necesitamos que se pueda colocar más de
  // un rol a un usuario». El principal sigue mandando —es el que se enseña en
  // las listas y el que usa medio CRM—; estos solo suman permisos.
  const [rolesExtra, setRolesExtra] = useState<UserRole[]>(
    (user?.roles_extra as UserRole[] | undefined) ?? [],
  );
  const alternarRolExtra = (r: UserRole) => setRolesExtra((prev) =>
    prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);
  const [seleccionados, setSeleccionados] = useState<ProjectAssignment[]>(user?.projects ?? []);
  const [telefono, setTelefono] = useState(user?.whatsapp_phone ?? '');
  const [facturaManager, setFacturaManager] = useState(!!user?.factura_manager);
  const [editarFechas, setEditarFechas] = useState(!!user?.editar_fechas_factura);
  // WhatsApp del CRM (#128). `null` no es «apagado»: es que falta la migracion
  // 156. Se separa para poder decirlo en vez de enseñar una casilla que no
  // guardaria nada.
  const faltaMigracionWhatsapp = esEdicion && user?.usa_whatsapp === null;
  const [usaWhatsapp, setUsaWhatsapp] = useState(!!user?.usa_whatsapp);

  const [nuevaPass, setNuevaPass] = useState('');
  const [repetirPass, setRepetirPass] = useState('');
  const [guardandoPass, setGuardandoPass] = useState(false);

  function alternarProyecto(projectId: number) {
    setSeleccionados((prev) => prev.some((p) => p.projectId === projectId)
      ? prev.filter((p) => p.projectId !== projectId)
      // El gestor siempre recibe; para el resto el reparto es opt-in.
      : [...prev, { projectId, recibeLeads: role === 'gestor' }]);
  }

  function alternarRecibeLeads(projectId: number) {
    setSeleccionados((prev) => prev.map((p) => p.projectId === projectId
      ? { ...p, recibeLeads: !p.recibeLeads }
      : p));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    // El backend pide 2 caracteres minimo; validarlo aqui evita el viaje.
    if (nombre.trim().length < 2) {
      toast({ title: 'Nombre demasiado corto', description: 'Mínimo 2 caracteres.', variant: 'destructive' });
      return;
    }
    if (!esEdicion) {
      if (!EMAIL_RE.test(email.trim())) {
        toast({ title: 'Email inválido', description: 'Revisa el formato del email.', variant: 'destructive' });
        return;
      }
      if (seleccionados.length === 0) {
        toast({ title: 'Falta el proyecto', description: 'Asigna al menos un proyecto.', variant: 'destructive' });
        return;
      }
    }
    // El correo de otro (#248): solo el super admin, y avisando antes de guardar
    // de lo que supone, sobre todo si recibe prospectos por Make.
    const correoNuevo = email.trim().toLowerCase();
    if (esEdicion && canChangeEmail && correoNuevo !== user!.email.toLowerCase()) {
      if (!EMAIL_RE.test(correoNuevo)) {
        toast({ title: 'Email inválido', description: 'Revisa el formato del email.', variant: 'destructive' });
        return;
      }
      const aviso = await onCheckEmail().catch(() => null);
      if (!window.confirm(confirmacionCambioCorreo(user!.nombre, user!.email, correoNuevo, aviso))) return;
    }
    onSubmit({
      nombre: nombre.trim(),
      email: email.trim(),
      role,
      // El principal nunca va repetido entre los añadidos.
      roles_extra: rolesExtra.filter((r) => r !== role),
      projects: seleccionados,
      whatsapp_phone: telefono.trim(),
      factura_manager: facturaManager,
      // Poder cambiar fechas sin poder facturar no sirve de nada: la pantalla de
      // fechas se abre desde la factura. Si se quita lo primero, cae lo segundo.
      editar_fechas_factura: facturaManager && editarFechas,
      usa_whatsapp: usaWhatsapp,
      reenviarEnlace: cambiaCorreo && reenviarEnlace,
    });
  }

  async function cambiarPassword() {
    const problema = problemaDeContrasena(nuevaPass, repetirPass);
    if (problema) {
      toast({ title: 'Revisa la contraseña', description: problema, variant: 'destructive' });
      return;
    }
    setGuardandoPass(true);
    try {
      await onResetPassword(nuevaPass, repetirPass);
      setNuevaPass('');
      setRepetirPass('');
    } finally {
      setGuardandoPass(false);
    }
  }

  return (
    <Portal>
      <div className="fixed inset-0 !m-0 z-[70] flex items-center justify-center sm:p-4">
        <div className="fixed inset-0 !m-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
        <div
          role="dialog"
          aria-modal="true"
          className="relative bg-card rounded-lg border border-border shadow-dialog w-full max-w-lg mx-4 p-4 sm:p-8 overflow-y-auto max-h-[90vh] animate-in"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-semibold">{esEdicion ? 'Editar usuario' : 'Crear usuario'}</h2>
              <p className="text-muted-foreground text-sm mt-0.5">
                {esEdicion
                  ? 'Nombre, rol, proyectos y acceso.'
                  : 'Se le enviará un email con un enlace para poner su contraseña.'}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Cerrar"
              className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted"
            >
              <X size={18} weight="bold" />
            </button>
          </div>

          <form onSubmit={enviar} className="space-y-4">
            {esEdicion && (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-semibold ${avatarColorFor(user!.id)}`}>
                  {getInitials(user!.nombre)}
                </div>
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate">{user!.nombre}</p>
                  <p className="text-secundario text-muted-foreground truncate">{user!.email}</p>
                </div>
              </div>
            )}

            <div>
              <label htmlFor="user-nombre" className="text-xs text-muted-foreground mb-1.5 block px-1">Nombre *</label>
              <input
                id="user-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre completo"
                maxLength={200}
                className={inputClass}
                required
              />
            </div>

            {!esEdicion ? (
              <div>
                <label htmlFor="user-email" className="text-xs text-muted-foreground mb-1.5 block px-1">Email *</label>
                <input
                  id="user-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="correo@empresa.com"
                  className={inputClass}
                  required
                />
              </div>
            ) : canChangeEmail ? (
              <div>
                <label htmlFor="user-email" className="text-xs text-muted-foreground mb-1.5 block px-1">Email *</label>
                <input
                  id="user-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  maxLength={255}
                  className={inputClass}
                  required
                />
                <p className="text-secundario text-muted-foreground mt-1 px-1 flex items-start gap-1">
                  <Info size={11} className="mt-px flex-shrink-0" />
                  Es con lo que entra: al cambiarlo, con el viejo ya no podrá, y se cierran sus sesiones.
                  Se le avisa por correo en la dirección vieja. Si recibe prospectos por Make, cámbialo también allí.
                </p>
                {/* «Reenviar enlace de acceso» al correo nuevo (#246). A un tutor no le
                    sale ningún correo mientras siga el freno: se dice en vez de esconderlo. */}
                {cambiaCorreo && (
                  role === 'tutor' ? (
                    <p className="text-secundario text-muted-foreground mt-1.5 px-1">
                      A los tutores no se les manda ningún correo por ahora: si lo necesita, ponle tú una contraseña abajo y pásasela.
                    </p>
                  ) : (
                    <label className="mt-1.5 flex items-start gap-2 px-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reenviarEnlace}
                        onChange={(e) => setReenviarEnlace(e.target.checked)}
                        className="mt-0.5"
                      />
                      <span className="text-sm">
                        Reenviar enlace de acceso
                        <span className="block text-secundario text-muted-foreground">
                          Le llega a la dirección nueva para poner su contraseña.
                        </span>
                      </span>
                    </label>
                  )
                )}
              </div>
            ) : (
              <div>
                <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Email</label>
                <input value={user!.email} readOnly disabled className={`${inputClass} opacity-60 cursor-not-allowed`} />
                <p className="text-secundario text-muted-foreground mt-1 px-1 flex items-start gap-1">
                  <Info size={11} className="mt-px flex-shrink-0" />
                  Solo un superadmin puede cambiar el correo.
                </p>
              </div>
            )}

            <div>
              <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Rol *</label>
              <Select<UserRole>
                value={role}
                onChange={setRole}
                options={ASSIGNABLE_ROLES.map((r) => ({ value: r.value, label: r.label }))}
                ariaLabel="Rol"
              />
              <p className="text-secundario text-muted-foreground mt-1 px-1">
                {ASSIGNABLE_ROLES.find((r) => r.value === role)?.hint}
              </p>
            </div>

            {/* Y ADEMÁS. Hay quien lleva prospectos y también da clase: antes
                había que elegir, y lo que no se eligiera se perdía.

                Solo SUMAN: si un rol deja hacer algo, se puede. Nunca quitan,
                porque entonces añadir un rol recortaría permisos, que es lo
                contrario de lo que se busca al añadirlo. */}
            <fieldset>
              <legend className="mb-1.5 px-1 text-secundario text-muted-foreground">
                Y además es…
              </legend>
              <div className="flex flex-wrap gap-1.5">
                {ASSIGNABLE_ROLES.filter((r) => r.value !== role).map((r) => {
                  const puesto = rolesExtra.includes(r.value);
                  return (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => alternarRolExtra(r.value)}
                      aria-pressed={puesto}
                      className={
                        'rounded-md border px-2.5 py-1 text-normal transition-colors '
                        + 'focus:outline-none focus:ring-2 focus:ring-primary/40 '
                        + (puesto
                          ? 'border-primary bg-primary/10 font-semibold text-primary'
                          : 'border-border hover:bg-muted')
                      }
                    >
                      {r.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 px-1 text-secundario text-muted-foreground">
                {rolesExtra.length === 0
                  ? 'Opcional. Suma los permisos de otro rol sin perder los de este.'
                  : `Podrá hacer lo de ${ASSIGNABLE_ROLES.find((r) => r.value === role)?.label} y también lo de ${rolesExtra.map((x) => ASSIGNABLE_ROLES.find((r) => r.value === x)?.label).join(' y ')}.`}
              </p>
            </fieldset>

            {projects.length > 0 && (
              <ProjectSelector
                projects={projects}
                selected={seleccionados}
                role={role}
                onToggle={alternarProyecto}
                onToggleRecibeLeads={alternarRecibeLeads}
                required={!esEdicion}
              />
            )}

            {/* Facturacion. No se deriva del rol: ser «gestor» no decide quien
                factura. Vanessa lo es y no debe. Un admin puede siempre, por su
                rol, asi que para el las casillas no cambian nada y no se pintan. */}
            {(role === 'gestor' || role === 'soporte') && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <p className="text-xs text-muted-foreground px-1">Facturación</p>
                <label className="flex items-start gap-2 cursor-pointer px-1">
                  <input
                    type="checkbox"
                    checked={facturaManager}
                    onChange={(e) => setFacturaManager(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    Puede emitir y corregir facturas
                    <span className="block text-secundario text-muted-foreground">
                      Solo las de sus propios prospectos.
                    </span>
                  </span>
                </label>
                <label className={`flex items-start gap-2 px-1 ${facturaManager ? 'cursor-pointer' : 'opacity-50'}`}>
                  <input
                    type="checkbox"
                    checked={facturaManager && editarFechas}
                    disabled={!facturaManager}
                    onChange={(e) => setEditarFechas(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    Puede cambiar las fechas de emisión y de pago
                    <span className="block text-secundario text-muted-foreground">
                      Sin tocar importes ni conceptos.
                    </span>
                  </span>
                </label>
              </div>
            )}

            {/* WhatsApp del CRM (#128). Aparte del rol a proposito: el rol dice
                quien PUEDE tenerlo —un tutor no— y esto quien lo usa. Hoy son
                las gestoras y Daniela; manana entra alguien y se enciende aqui,
                sin desplegar nada. Un tutor no lo ve porque no le corresponde. */}
            {esEdicion && role !== 'tutor' && (
              <div className="rounded-lg border border-border p-3">
                <label className={`flex items-start gap-2 px-1 ${faltaMigracionWhatsapp ? 'opacity-50' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={usaWhatsapp}
                    disabled={faltaMigracionWhatsapp}
                    onChange={(e) => setUsaWhatsapp(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-sm">
                    Usa el WhatsApp del CRM
                    <span className="block text-secundario text-muted-foreground">
                      Sale en el panel de sesiones y puede enlazar su número.
                      Apagarlo no desvincula el número que ya tenga.
                    </span>
                  </span>
                </label>
                {faltaMigracionWhatsapp && (
                  <p className="text-secundario text-amber-600 dark:text-amber-500 mt-1.5 px-1">
                    Falta aplicar la migración 156. Hasta entonces esto no se
                    puede guardar y el panel sigue enseñando a todo el que puede.
                  </p>
                )}
              </div>
            )}

            {esEdicion && (
              <div>
                <label htmlFor="user-tel" className="text-xs text-muted-foreground mb-1.5 block px-1">Teléfono (WhatsApp)</label>
                <input
                  id="user-tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+34 600 000 000"
                  maxLength={30}
                  className={inputClass}
                />
                <p className="text-secundario text-muted-foreground mt-1 px-1">
                  Se usa para el widget de WhatsApp y el contacto del gestor.
                </p>
              </div>
            )}

            {esEdicion && !canResetPassword && (
              <div className="border-t border-border pt-3 mt-1">
                <p className="text-secundario text-muted-foreground px-1 flex items-start gap-1.5">
                  <Lock size={12} className="mt-px flex-shrink-0" />
                  Reiniciar la contraseña de otra persona solo lo puede hacer un superadministrador.
                  El servidor lo rechaza aunque el campo estuviera aquí.
                </p>
              </div>
            )}

            {esEdicion && canResetPassword && (
              <div className="border-t border-border pt-3 mt-1">
                <label htmlFor="user-pass" className="text-xs font-semibold flex items-center gap-1.5 mb-1.5 px-1">
                  <Key size={12} weight="bold" /> Reiniciar contraseña
                </label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <input
                    id="user-pass"
                    type="text"
                    value={nuevaPass}
                    onChange={(e) => setNuevaPass(e.target.value)}
                    placeholder="Nueva contraseña"
                    autoComplete="new-password"
                    maxLength={200}
                    className={`${inputClass} font-mono`}
                  />
                  <input
                    id="user-pass-2"
                    type="text"
                    value={repetirPass}
                    onChange={(e) => setRepetirPass(e.target.value)}
                    placeholder="Repítela"
                    aria-label="Repite la contraseña"
                    autoComplete="new-password"
                    maxLength={200}
                    className={`${inputClass} font-mono`}
                  />
                  <button
                    type="button"
                    onClick={cambiarPassword}
                    disabled={guardandoPass || nuevaPass.length === 0 || repetirPass.length === 0}
                    className="h-9 px-3 rounded-md border border-border text-sm font-medium hover:bg-muted disabled:opacity-50 whitespace-nowrap"
                  >
                    {guardandoPass ? '…' : 'Cambiar'}
                  </button>
                </div>
                <p className="text-secundario text-muted-foreground mt-1 px-1">
                  Mínimo 8 caracteres, con una mayúscula y un número. Se la comunicas tú al usuario.
                  Al cambiarla se cierran sus sesiones activas.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {loading ? 'Guardando…' : esEdicion ? 'Guardar cambios' : 'Crear usuario'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}
