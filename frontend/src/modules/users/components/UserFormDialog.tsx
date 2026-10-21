import { useState } from 'react';
import { X, Lock, ShieldCheck } from '@phosphor-icons/react';
import { useEscapeKey } from '@/shared/hooks/useDialogA11y';
import type { Project, UserRole } from '@/shared/types';
import Portal from '@/shared/components/ui/portal';
import Select from '@/shared/components/ui/Select';
import Field from '@/shared/components/ui/Field';
import { avatarColorFor, getInitials, inputClass } from '@/shared/lib/ui';
import { toast } from '@/shared/hooks/useToast';
import { avisoDeLoQueFalta, type Falta } from '@/shared/lib/loQueFalta';
import type { AvisoCambioCorreo, CrmUser, Empresa, ProjectAssignment } from '../api/users.api';
import { ASSIGNABLE_ROLES } from '../lib/usersUi';
import { confirmacionCambioCorreo, problemaDeContrasena } from '../lib/credenciales';
import ProjectSelector from './ProjectSelector';
import PermisosDePersona from '@/modules/permissions/components/PermisosDePersona';

export interface UserFormValues {
  nombre: string;
  email: string;
  role: UserRole;
  /** Roles de MAS. Quien lleva prospectos y ademas da clase no tiene que elegir. */
  roles_extra: UserRole[];
  projects: ProjectAssignment[];
  whatsapp_phone: string;
  /** Con un correo nuevo: mandarle el enlace para poner contraseña allí (#246). */
  reenviarEnlace: boolean;
  /**
   * Empresas enteras de un admin (#220). `undefined` = no se tocan: quien edita
   * no es super admin, o no hay migración. Vacía = quitarlas (sus campus se quedan).
   */
  empresaIds?: number[];
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
  /**
   * Las empresas del grupo, para dar una entera a un admin (#220). Solo llegan
   * si quien edita es super admin: si no, la casilla no se pinta.
   */
  empresas?: Empresa[];
  /** La migración 203 aún no está: la casilla sale apagada y se dice por qué. */
  faltaMigracionEmpresas?: boolean;
  loading: boolean;
  onClose: () => void;
  onSubmit: (values: UserFormValues) => void | Promise<void>;
  onResetPassword: (password: string, repetida: string) => Promise<void>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function UserFormDialog({
  user, projects, canResetPassword, canChangeEmail, loading, onClose, onSubmit, onCheckEmail, onResetPassword,
  empresas, faltaMigracionEmpresas = false,
}: Props) {
  const esEdicion = !!user;
  // Escape cierra, como los demás formularios (#106).
  useEscapeKey(onClose);

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
  // Las empresas enteras (#220). Diego, 10/10: «Un admin puede tener los
  // proyectos futuros, pero de SU empresa: mayormente los admin son por empresa».
  const puedeDarEmpresas = !!empresas && !faltaMigracionEmpresas;
  const [empresasEnteras, setEmpresasEnteras] = useState<number[]>(user?.empresa_ids ?? []);
  const [telefono, setTelefono] = useState(user?.whatsapp_phone ?? '');
  // Facturación, fechas de facturas y el WhatsApp del CRM ya no son casillas de
  // aquí (#423): son permisos del catálogo y se dan en «Ver permisos», con su
  // registro de quién y cuándo.

  // Sus permisos y de dónde le viene cada uno (#423).
  const [verPermisos, setVerPermisos] = useState(false);
  const [nuevaPass, setNuevaPass] = useState('');
  const [repetirPass, setRepetirPass] = useState('');
  const [guardandoPass, setGuardandoPass] = useState(false);

  function alternarProyecto(projectId: number) {
    setSeleccionados((prev) => prev.some((p) => p.projectId === projectId)
      ? prev.filter((p) => p.projectId !== projectId)
      // El gestor siempre recibe; para el resto el reparto es opt-in.
      : [...prev, { projectId, recibeLeads: role === 'gestor' }]);
  }

  /** Marcar o quitar de golpe los campus de una empresa (#220). */
  function marcarVarios(projectIds: number[], marcar: boolean) {
    setSeleccionados((prev) => {
      if (!marcar) return prev.filter((p) => !projectIds.includes(p.projectId));
      const nuevos = projectIds
        .filter((id) => !prev.some((p) => p.projectId === id))
        .map((projectId) => ({ projectId, recibeLeads: role === 'gestor' }));
      return [...prev, ...nuevos];
    });
  }

  /**
   * La casilla de la empresa entera. Al marcarla se marcan ya sus campus de
   * hoy —es lo que va a guardar el servidor, y así se ve—. Al quitarla, NO se
   * desmarcan: conserva lo que tiene y solo deja de recibir los nuevos.
   */
  function alternarEmpresa(issuerId: number) {
    const entera = empresasEnteras.includes(issuerId);
    setEmpresasEnteras((prev) => (entera ? prev.filter((x) => x !== issuerId) : [...prev, issuerId]));
    if (!entera) {
      marcarVarios(projects.filter((p) => Number(p.sociedad_emisora_id) === issuerId).map((p) => p.id), true);
    }
  }

  function alternarRecibeLeads(projectId: number) {
    setSeleccionados((prev) => prev.map((p) => p.projectId === projectId
      ? { ...p, recibeLeads: !p.recibeLeads }
      : p));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    // Todo lo que falta o está mal, de una vez (#106).
    // Un admin con una empresa entera ya tiene de dónde le llegan campus,
    // aunque esa empresa aún no tenga ninguno (#220).
    const conEmpresa = role === 'admin' && puedeDarEmpresas && empresasEnteras.length > 0;
    const faltan: Falta[] = [];
    if (!nombre.trim()) faltan.push({ title: 'Falta el nombre', description: 'Escríbelo en «Nombre».', que: 'el nombre en «Nombre»' });
    // El backend pide 2 caracteres minimo; validarlo aqui evita el viaje.
    else if (nombre.trim().length < 2) faltan.push({ title: 'Nombre demasiado corto', description: 'En «Nombre», al menos 2 caracteres.', que: 'un nombre de al menos 2 letras en «Nombre»' });
    if (!esEdicion && !email.trim()) faltan.push({ title: 'Falta el email', description: 'Escríbelo en «Email» como nombre@dominio.com.', que: 'el email en «Email»' });
    else if (!esEdicion && !EMAIL_RE.test(email.trim())) {
      faltan.push({ title: 'Email no válido', description: 'Escríbelo en «Email» como nombre@dominio.com.', que: 'un email válido en «Email» (nombre@dominio.com)' });
    }
    if (!esEdicion && seleccionados.length === 0 && !conEmpresa) {
      faltan.push({
        title: 'Falta el proyecto',
        description: role === 'admin' && puedeDarEmpresas
          ? 'Marca al menos un campus o una empresa entera.'
          : 'Asigna al menos un proyecto.',
        que: 'al menos un proyecto en «Proyectos asignados»',
      });
    }
    const falta = avisoDeLoQueFalta(faltan);
    if (falta) { toast(falta); return; }
    // El correo de otro (#248): solo el super admin, y avisando antes de guardar
    // de lo que supone, sobre todo si recibe prospectos por Make.
    const correoNuevo = email.trim().toLowerCase();
    if (esEdicion && canChangeEmail && correoNuevo !== user!.email.toLowerCase()) {
      if (!EMAIL_RE.test(correoNuevo)) {
        toast({ title: 'Email no válido', description: 'Escríbelo en «Email» como nombre@dominio.com.', variant: 'destructive' });
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
      reenviarEnlace: cambiaCorreo && reenviarEnlace,
      // Solo si quien edita puede darlas. Para otro rol que no sea admin, se
      // mandan vacías: una gestora no tiene empresas enteras.
      ...(puedeDarEmpresas ? { empresaIds: role === 'admin' ? empresasEnteras : [] } : {}),
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

          {/* noValidate: avisa el CRM (enviar), diciendo qué falta y dónde,
              y no el globo del navegador (#106). */}
          <form onSubmit={enviar} noValidate className="space-y-4">
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

            <Field label="Nombre" required htmlFor="user-nombre">
              <input autoComplete="off"
                id="user-nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Nombre completo"
                maxLength={200}
                className={inputClass}
                required
              />
            </Field>

            {!esEdicion ? (
              <Field label="Email" required htmlFor="user-email">
                <input autoComplete="off"
                  id="user-email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="correo@empresa.com"
                  className={inputClass}
                  required
                />
              </Field>
            ) : canChangeEmail ? (
              <div>
                <Field label="Email" required htmlFor="user-email"
                  hint="Es con lo que entra: al cambiarlo, con el viejo ya no podrá, y se cierran sus sesiones. Se le avisa por correo en la dirección vieja. Si recibe prospectos por Make, cámbialo también allí.">
                  <input autoComplete="off"
                    id="user-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    type="email"
                    maxLength={255}
                    className={inputClass}
                    required
                  />
                </Field>
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
              <Field label="Email" disabled htmlFor="user-email-fijo" hint="Solo un superadmin puede cambiar el correo.">
                <input autoComplete="off" id="user-email-fijo" value={user!.email} readOnly disabled className={`${inputClass} opacity-60 cursor-not-allowed`} />
              </Field>
            )}

            <Field label="Rol" required htmlFor="user-rol" hint={ASSIGNABLE_ROLES.find((r) => r.value === role)?.hint}>
              <Select<UserRole>
                id="user-rol"
                value={role}
                onChange={setRole}
                options={ASSIGNABLE_ROLES.map((r) => ({ value: r.value, label: r.label }))}
                ariaLabel="Rol"
              />
            </Field>

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
                onSetMany={marcarVarios}
                required={!esEdicion}
                empresas={empresas}
                empresasEnteras={empresasEnteras}
                onToggleEmpresa={empresas ? alternarEmpresa : undefined}
                faltaMigracionEmpresas={faltaMigracionEmpresas}
              />
            )}

            {/* Todo lo que puede hacer y de dónde le viene (#423): su rol, su rol a
                medida o una excepción suya. Ahí mismo se le cambian. */}
            {esEdicion && (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                <span className="text-sm">
                  Permisos
                  <span className="block text-secundario text-muted-foreground">
                    Lo que puede hacer, de dónde le viene y sus excepciones.
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => setVerPermisos(true)}
                  className="inline-flex h-9 flex-shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted"
                >
                  <ShieldCheck size={14} weight="bold" /> Ver permisos
                </button>
              </div>
            )}
            {verPermisos && user && <PermisosDePersona userId={user.id} onClose={() => setVerPermisos(false)} />}

            {esEdicion && (
              <Field label="Teléfono (WhatsApp)" htmlFor="user-tel" hint="Se usa para el widget de WhatsApp y el contacto del gestor.">
                <input autoComplete="off"
                  id="user-tel"
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="+34 600 000 000"
                  maxLength={30}
                  className={inputClass}
                />
              </Field>
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
              <Field label="Reiniciar contraseña" htmlFor="user-pass" className="border-t border-border pt-3 mt-1"
                hint="Mínimo 8 caracteres, con una mayúscula y un número. Se la comunicas tú al usuario. Al cambiarla se cierran sus sesiones activas.">
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
              </Field>
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
