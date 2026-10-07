import { useMemo, useState } from 'react';
import { Plus, WarningCircle, Lock } from '@phosphor-icons/react';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import SkeletonTable from '@/shared/components/ui/SkeletonTable';
import ConfirmDialog from '@/shared/components/ui/ConfirmDialog';
import Card from '@/shared/components/ui/Card';
import { toast } from '@/shared/hooks/useToast';
import {
  avisoCambioCorreo, createUser, deactivateUser, reactivateUser, setUserPassword, updateUser, type CrmUser,
} from '../api/users.api';
import useUsers from '../hooks/useUsers';
import useAvailabilityMap from '../hooks/useAvailabilityMap';
import UsersToolbar from './UsersToolbar';
import UsersTable from './UsersTable';
import TablePagination from './TablePagination';
import UserFormDialog, { type UserFormValues } from './UserFormDialog';
import InviteLinkBanner from './InviteLinkBanner';
import AvailabilityDialog from './AvailabilityDialog';

export default function UsersPanel() {
  const { projects, user: me } = useAuth();
  const { activeProject } = useProjectContext();
  const esSuperadmin = me?.role === 'superadmin';

  // Mientras nadie toque el filtro vale el proyecto activo; en cuanto se elige
  // algo, manda la elección. Se deriva en vez de guardarse para no necesitar un
  // efecto que lo sincronice cuando el proyecto activo llega más tarde.
  const [elegido, setElegido] = useState<string | null>(null);
  const projectFilter = elegido
    // En «todos los proyectos» activeProject.id vale -1: no es un proyecto.
    ?? (activeProject?.id && activeProject.id > 0 ? String(activeProject.id) : 'all');
  const projectId = useMemo(
    () => (projectFilter === 'all' ? undefined : Number(projectFilter) || undefined),
    [projectFilter],
  );

  const lista = useUsers(projectId);
  const disponibilidad = useAvailabilityMap();

  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [dialogo, setDialogo] = useState<{ modo: 'crear' } | { modo: 'editar'; user: CrmUser } | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [porDesactivar, setPorDesactivar] = useState<CrmUser | null>(null);
  const [desactivando, setDesactivando] = useState(false);
  const [invitacion, setInvitacion] = useState<{ email: string; url: string } | null>(null);
  const [porAusencias, setPorAusencias] = useState<CrmUser | null>(null);

  async function guardar(values: UserFormValues) {
    setGuardando(true);
    try {
      if (dialogo?.modo === 'crear') {
        const { setPasswordToken } = await createUser({
          nombre: values.nombre,
          email: values.email,
          role: values.role,
          roles_extra: values.roles_extra,
          projects: values.projects,
        });
        if (setPasswordToken) {
          const base = (import.meta.env.BASE_URL || '/crm/').replace(/\/$/, '');
          setInvitacion({
            email: values.email,
            url: `${window.location.origin}${base}/set-password?token=${setPasswordToken}`,
          });
          toast({ title: 'Usuario creado', description: 'Comparte el link de invitación que aparece arriba.' });
        } else {
          toast({ title: 'Usuario creado', description: `Email de bienvenida enviado a ${values.email}` });
        }
      } else if (dialogo?.modo === 'editar') {
        const sinProyectos = values.projects.length === 0;
        // El correo solo si ha cambiado, y solo lo cambia el super admin (#248):
        // a cualquier otro el servidor le contesta 403.
        const correoNuevo = values.email.trim().toLowerCase();
        const cambiaCorreo = esSuperadmin && correoNuevo !== dialogo.user.email.toLowerCase();
        await updateUser(dialogo.user.id, {
          nombre: values.nombre,
          ...(cambiaCorreo ? { email: correoNuevo, reenviarEnlace: values.reenviarEnlace } : {}),
          role: values.role,
          // Se manda SIEMPRE, aunque venga vacia: una lista vacia significa
          // «quitale los de mas», y omitirla dejaria imposible volver atras.
          roles_extra: values.roles_extra,
          // Desmarcarlos todos tiene que quitarlos de verdad, y para eso hay que
          // mandar el formato viejo: `projects: []` el backend lo ignora.
          ...(sinProyectos ? { projectIds: [] } : { projects: values.projects }),
          whatsapp_phone: values.whatsapp_phone,
          usa_whatsapp: values.usa_whatsapp,
          // Estas dos las pedia el formulario y NO se mandaban: se marcaban, se
          // guardaba, y volvian a salir como estaban. El valor de partida sale
          // del listado, asi que mandarlas no pisa nada de quien no las toque.
          factura_manager: values.factura_manager,
          editar_fechas_factura: values.editar_fechas_factura,
        });
        toast(sinProyectos
          ? {
            title: 'Usuario actualizado, sin proyectos',
            description: `${values.nombre} ya no tiene ningún proyecto asignado: al entrar no verá nada.`,
          }
          : cambiaCorreo
            ? { title: 'Usuario actualizado', description: `${values.nombre} entra ahora con ${correoNuevo}. Sus sesiones se han cerrado.` }
            : { title: 'Usuario actualizado', description: values.nombre });
      }
      setDialogo(null);
      lista.recargar();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    } finally {
      setGuardando(false);
    }
  }

  async function reiniciarPassword(password: string, repetida: string) {
    if (dialogo?.modo !== 'editar') return;
    try {
      await setUserPassword(dialogo.user.id, password, repetida);
      toast({
        title: 'Contraseña actualizada',
        description: `${dialogo.user.nombre} deberá entrar con la nueva. Sus sesiones se han cerrado.`,
      });
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    }
  }

  async function alternarActivo(user: CrmUser) {
    setOpenMenuId(null);
    if (user.active) {
      // Desactivar reparte sus prospectos entre el resto. No es reversible con
      // un clic, asi que se pregunta antes.
      setPorDesactivar(user);
      return;
    }
    try {
      await reactivateUser(user.id);
      toast({ title: 'Usuario reactivado', description: user.nombre });
      lista.recargar();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    }
  }

  async function confirmarDesactivar() {
    if (!porDesactivar) return;
    setDesactivando(true);
    try {
      const r = await deactivateUser(porDesactivar.id);
      const reasignados = r.leads_reasignados || 0;
      toast({
        title: 'Usuario desactivado',
        description: reasignados > 0
          ? `${porDesactivar.nombre}. ${reasignados} prospecto${reasignados !== 1 ? 's' : ''} repartido${reasignados !== 1 ? 's' : ''} entre el resto.`
          : porDesactivar.nombre,
      });
      setPorDesactivar(null);
      lista.recargar();
    } catch (err: any) {
      toast({ title: 'Error', description: err?.message, variant: 'destructive' });
    } finally {
      setDesactivando(false);
    }
  }

  if (lista.loading) {
    return (
      <div className="space-y-5">
        <div>
          <div className="w-40 h-5 bg-muted rounded animate-pulse mb-2" />
          <div className="w-60 h-4 bg-muted rounded animate-pulse" />
        </div>
        <SkeletonTable rows={5} columns={6} />
      </div>
    );
  }

  // Sin permiso no es un fallo: reintentar no lo arregla, y pintarlo en rojo con
  // un botón de «reintentar» manda a la gente a pulsarlo hasta cansarse. La ruta
  // /configuracion no filtra por rol —solo se esconde del menú—, así que aquí llega
  // cualquiera que escriba la dirección a mano.
  if (lista.error?.status === 403) {
    return (
      <Card padding="none" className="bg-muted/40 p-8 text-center">
        <Lock size={36} className="text-muted-foreground mx-auto mb-3" weight="regular" />
        <p className="text-sm font-semibold mb-1">Esta pantalla es para administradores</p>
        <p className="text-secundario text-muted-foreground max-w-sm mx-auto">
          Tu cuenta ({me?.role}) no puede ver ni gestionar usuarios. Si necesitas acceso, pídeselo a un superadministrador.
        </p>
      </Card>
    );
  }

  if (lista.error) {
    // Sobre tokens: seis clases de rojo escritas a mano —incluidas las variantes
    // `dark:`— se quedan en dos que ya saben qué rojo toca en cada tema.
    return (
      <Card padding="none" className="bg-destructive-soft border-destructive/30 p-8 text-center">
        <WarningCircle size={36} className="text-destructive-soft-foreground mx-auto mb-3" weight="regular" />
        <p className="text-sm font-semibold mb-1 text-destructive-soft-foreground">
          No se pudieron cargar los usuarios
        </p>
        <p className="text-secundario text-destructive-soft-foreground/80 mb-4">{lista.error.mensaje}</p>
        <button
          onClick={lista.recargar}
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-destructive/30 text-secundario font-semibold text-destructive-soft-foreground hover:bg-destructive/10 transition-colors focus:outline-none focus:ring-2 focus:ring-destructive/40"
        >
          Reintentar
        </button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-seccion">Gestión de usuarios</h2>
          <p className="text-normal text-muted-foreground mt-0.5">Quién entra al CRM, con qué rol y en qué proyectos</p>
        </div>
        <button
          onClick={() => setDialogo({ modo: 'crear' })}
          aria-label="Crear usuario"
          className="flex items-center gap-2 h-9 px-3 sm:px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Plus size={14} weight="bold" /> <span className="hidden sm:inline">Crear usuario</span>
        </button>
      </div>

      {invitacion && (
        <InviteLinkBanner email={invitacion.email} url={invitacion.url} onClose={() => setInvitacion(null)} />
      )}

      {lista.truncado && (
        <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3 text-xs flex items-start gap-2">
          <WarningCircle size={15} weight="duotone" className="text-amber-600 flex-shrink-0 mt-px" />
          <p className="text-amber-900 dark:text-amber-200">
            Se muestran <strong>{lista.cargados}</strong> de <strong>{lista.total}</strong> usuarios.
            El buscador solo mira los cargados — buscar sobre el total necesita que el endpoint acepte búsqueda.
          </p>
        </div>
      )}

      <UsersToolbar
        filters={lista.filters}
        onFilterChange={lista.setFilter}
        onClear={lista.limpiarFiltros}
        hayFiltroActivo={lista.hayFiltroActivo}
        projectFilter={projectFilter}
        onProjectFilterChange={setElegido}
        projects={projects || []}
        totalFiltrados={lista.totalFiltrados}
        cargados={lista.cargados}
      />

      <Card padding="none" overflowHidden>
        <UsersTable
          users={lista.visibles}
          projects={projects || []}
          disponibilidad={disponibilidad.porUsuario}
          openMenuId={openMenuId}
          onOpenMenu={setOpenMenuId}
          onEdit={(u) => { setOpenMenuId(null); setDialogo({ modo: 'editar', user: u }); }}
          onToggleActive={alternarActivo}
          onAvailability={(u) => { setOpenMenuId(null); setPorAusencias(u); }}
          hayFiltroActivo={lista.hayFiltroActivo}
          onClearFilters={lista.limpiarFiltros}
        />
        <TablePagination
          page={lista.page}
          totalPaginas={lista.totalPaginas}
          totalElementos={lista.totalFiltrados}
          porPagina={lista.porPagina}
          onPageChange={lista.setPage}
        />
      </Card>

      {dialogo && (
        <UserFormDialog
          // Sin key, pasar de editar a una persona a editar a otra reutilizaria la
          // instancia y el formulario se quedaria con los datos del anterior.
          key={dialogo.modo === 'editar' ? dialogo.user.id : 'nuevo'}
          user={dialogo.modo === 'editar' ? dialogo.user : null}
          projects={projects || []}
          canResetPassword={esSuperadmin}
          canChangeEmail={esSuperadmin}
          onCheckEmail={() => (dialogo.modo === 'editar' ? avisoCambioCorreo(dialogo.user.id) : Promise.resolve(null))}
          loading={guardando}
          onClose={() => setDialogo(null)}
          onSubmit={guardar}
          onResetPassword={reiniciarPassword}
        />
      )}

      {porAusencias && (
        <AvailabilityDialog
          key={porAusencias.id}
          user={porAusencias}
          estadoInicial={disponibilidad.porUsuario.get(porAusencias.id)}
          onClose={() => setPorAusencias(null)}
          onChange={disponibilidad.recargar}
        />
      )}

      <ConfirmDialog
        open={!!porDesactivar}
        tone="destructive"
        title={`¿Desactivar a ${porDesactivar?.nombre || ''}?`}
        message={
          <>
            No podrá entrar y se le cerrará la sesión al momento.
            Sus prospectos se reparten automáticamente entre el resto del equipo del proyecto.
            <br />
            Se puede reactivar después, pero los prospectos ya no vuelven solos.
          </>
        }
        confirmLabel="Desactivar"
        loading={desactivando}
        onConfirm={confirmarDesactivar}
        onCancel={() => setPorDesactivar(null)}
      />
    </div>
  );
}
