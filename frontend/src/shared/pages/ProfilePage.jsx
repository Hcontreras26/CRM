import { useState, useRef, lazy, Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useTheme } from '@/contexts/ThemeContext';
import { toast } from '@/shared/hooks/useToast';
import client from '@/shared/api/client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  User,
  Lock,
  Eye,
  EyeSlash,
  Sun,
  Moon,
  ShieldCheck,
  Folder,
  Camera,
  Trash,
} from '@phosphor-icons/react';
import PageHeader from '@/shared/components/ui/PageHeader';
import { inputClass } from '@/shared/lib/ui';
import Field from '@/shared/components/ui/Field';
const ConfirmDialog = lazy(() => import('@/shared/components/ui/ConfirmDialog'));
// Proyectos ahora vienen del AuthContext via ProjectContext

// El correo no se cambia desde aqui: es con lo que se entra, y el servidor
// solo acepta el nombre.
const profileSchema = z.object({
  nombre: z.string().trim().min(2, 'Mínimo 2 caracteres'),
  email: z.string().optional(),
});

// Las mismas reglas que aplica el servidor, para avisar antes de enviar.
const passwordSchema = z.object({
  current: z.string().min(1, 'Requerido'),
  nueva: z.string()
    .min(8, 'Mínimo 8 caracteres')
    .regex(/[A-Z]/, 'Al menos una mayúscula')
    .regex(/[0-9]/, 'Al menos un número'),
  confirmar: z.string().min(1, 'Requerido'),
}).refine((d) => d.nueva === d.confirmar, { message: 'Las contraseñas no coinciden', path: ['confirmar'] })
  .refine((d) => d.nueva !== d.current, { message: 'Tiene que ser distinta de la actual', path: ['nueva'] });


const primaryBtn = 'inline-flex items-center justify-center h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/40';

const ROLE_LABELS = { superadmin: 'Superadmin', admin: 'Admin', gestor: 'Gestor' };

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { logout } = useAuth();
  // El propio correo, solo un tutor (#246, Diego 09/10). El resto lo pide a administración.
  const esTutor = user?.role === 'tutor';
  const [correoNuevo, setCorreoNuevo] = useState('');
  const [cambiandoCorreo, setCambiandoCorreo] = useState(false);
  async function onCambiarCorreo(e) {
    e.preventDefault();
    const nuevo = correoNuevo.trim().toLowerCase();
    if (!nuevo || nuevo === String(user?.email || '').toLowerCase()) return;
    setCambiandoCorreo(true);
    try {
      await client.patch('/auth/me/email', { email: nuevo });
      // Es con lo que se entra: el servidor cierra las sesiones, hay que volver a entrar.
      toast({ title: 'Correo cambiado', description: `Vuelve a entrar con ${nuevo}. Hemos avisado a administración.` });
      setTimeout(() => { logout?.(); }, 2500);
    } catch (err) {
      toast({ title: 'No se pudo cambiar', description: err?.data?.error || err?.message, variant: 'destructive' });
    } finally { setCambiandoCorreo(false); }
  }
  const { projects: allProjects } = useProjectContext();
  const { theme, toggleTheme } = useTheme();
  const [showPassword, setShowPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarVersion, setAvatarVersion] = useState(Date.now());
  const [confirmDeleteAvatar, setConfirmDeleteAvatar] = useState(false);
  const fileInputRef = useRef(null);

  const userProjects = allProjects || [];

  const initials = user?.nombre?.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || '??';

  const baseUrl = (import.meta.env.BASE_URL || '/crm/').replace(/\/$/, '');
  const avatarSrc = user?.avatar_url ? `${baseUrl}/api/users/${user.id}/avatar?v=${avatarVersion}` : null;

  async function handleAvatarUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast({ title: 'Imagen muy grande', description: 'Máximo 2 MB', variant: 'destructive' });
      return;
    }
    setUploadingAvatar(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await client.post(`/users/${user.id}/avatar`, fd);
      if (res.success) {
        toast({ title: 'Foto actualizada' });
        setAvatarVersion(Date.now());
        refreshUser?.();
      }
    } catch (err) {
      toast({ title: 'Error', description: err?.data?.error || err.message, variant: 'destructive' });
    } finally {
      setUploadingAvatar(false);
      e.target.value = '';
    }
  }

  async function doAvatarDelete() {
    try {
      await client.delete(`/users/${user.id}/avatar`);
      toast({ title: 'Foto eliminada' });
      setAvatarVersion(Date.now());
      refreshUser?.();
    } catch (err) {
      toast({ title: 'Error', description: err?.data?.error, variant: 'destructive' });
    } finally { setConfirmDeleteAvatar(false); }
  }

  // Profile form
  const {
    register: regProfile,
    handleSubmit: handleProfile,
    formState: { errors: errProfile, isSubmitting: subProfile },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: { nombre: user?.nombre || '', email: user?.email || '' },
  });

  // Password form
  const {
    register: regPass,
    handleSubmit: handlePass,
    reset: resetPass,
    formState: { errors: errPass, isSubmitting: subPass },
  } = useForm({
    resolver: zodResolver(passwordSchema),
    defaultValues: { current: '', nueva: '', confirmar: '' },
  });

  // Hasta el 01/10 estos dos esperaban medio segundo y decian «guardado» sin
  // llamar a nada: la contraseña no cambiaba aunque la pantalla dijera que si.
  async function onSaveProfile(data) {
    try {
      await client.patch('/auth/me', { nombre: data.nombre.trim() });
      toast({ title: 'Perfil actualizado', description: 'Tu nombre se ha guardado.' });
      refreshUser?.();
    } catch (err) {
      toast({ title: 'No se pudo guardar', description: err?.data?.error || err?.message, variant: 'destructive' });
    }
  }

  async function onChangePassword(data) {
    try {
      await client.post('/auth/change-password', {
        currentPassword: data.current,
        newPassword: data.nueva,
        confirmPassword: data.confirmar,
      });
      resetPass();
      toast({ title: 'Contraseña actualizada', description: 'La próxima vez entra con la nueva.' });
    } catch (err) {
      toast({ title: 'No se pudo cambiar', description: err?.data?.error || err?.message || 'Revisa la contraseña actual.', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <PageHeader
        title="Mi Perfil"
        subtitle="Gestiona tu información personal y seguridad"
      />

      {/* Avatar card */}
      <section className="bg-card p-5 rounded-lg border border-border">
        <div className="flex items-center gap-4">
          <div className="relative group shrink-0">
            <div className="w-20 h-20 rounded-lg bg-primary/10 flex items-center justify-center text-primary text-2xl font-semibold overflow-hidden">
              {avatarSrc ? (
                <img src={avatarSrc} alt="" width={80} height={80} loading="lazy" decoding="async" className="w-full h-full object-cover" />
              ) : initials}
            </div>
            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleAvatarUpload} className="hidden" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              aria-label={avatarSrc ? 'Cambiar foto de perfil' : 'Subir foto de perfil'}
              className="absolute inset-0 flex items-center justify-center bg-black/60 text-primary-foreground text-[10px] font-bold opacity-0 group-hover:opacity-100 rounded-lg transition-opacity focus:outline-none focus:ring-2 focus:ring-primary/40 focus:opacity-100"
            >
              {uploadingAvatar ? 'Subiendo…' : avatarSrc ? 'Cambiar' : 'Subir foto'}
            </button>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold truncate">{user?.nombre}</h2>
            <p className="text-sm text-muted-foreground truncate">{user?.email}</p>
            <div className="flex items-center flex-wrap gap-2 mt-2">
              <span className="px-2.5 py-1 rounded-full text-[10px] font-medium bg-primary/10 text-primary inline-flex items-center gap-1">
                <ShieldCheck size={12} weight="regular" /> {ROLE_LABELS[user?.role] || user?.role}
              </span>
              <span className="text-[11px] text-muted-foreground inline-flex items-center gap-1">
                <Folder size={12} /> {userProjects.length} proyecto{userProjects.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
          <div className="hidden sm:flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              aria-label={avatarSrc ? 'Cambiar foto de perfil' : 'Subir foto de perfil'}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-xs font-medium hover:bg-muted transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-primary/40"
            >
              <Camera size={14} weight="regular" /> {avatarSrc ? 'Cambiar' : 'Subir foto'}
            </button>
            {avatarSrc && (
              <button
                type="button"
                onClick={() => setConfirmDeleteAvatar(true)}
                aria-label="Eliminar foto de perfil"
                className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-card text-xs font-medium text-destructive hover:bg-destructive-soft transition-colors focus:outline-none focus:ring-2 focus:ring-destructive/40"
              >
                <Trash size={14} weight="regular" /> Eliminar
              </button>
            )}
          </div>
        </div>

        {/* Projects list */}
        {userProjects.length > 0 && (
          <div className="mt-5 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Proyectos asignados</p>
            <div className="flex flex-wrap gap-2">
              {userProjects.map((p) => (
                <span key={p.id} className="px-3 py-1.5 rounded-md bg-muted text-[12px] font-medium">
                  {p.nombre}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Edit profile */}
      <section className="bg-card p-5 rounded-lg border border-border">
        <div className="flex items-center gap-2 mb-4">
          <User size={18} weight="regular" className="text-primary" />
          <h3 className="text-base font-semibold">Información personal</h3>
        </div>
        <form onSubmit={handleProfile(onSaveProfile)} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nombre *" error={errProfile.nombre?.message}>
              <input {...regProfile('nombre')} className={inputClass} />
            </Field>
            <Field label="Email" error={errProfile.email?.message}>
              <input {...regProfile('email')} type="email" readOnly aria-readonly="true"
                title={esTutor ? "Es con lo que entras. Cámbialo abajo." : "Es con lo que entras. Para cambiarlo, pídeselo a un administrador."}
                className={inputClass + ' bg-muted/40 text-muted-foreground cursor-not-allowed'} />
            </Field>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={subProfile} className={primaryBtn}>
              {subProfile ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </form>
        {esTutor && (
          <form onSubmit={onCambiarCorreo} className="mt-5 pt-4 border-t border-border space-y-2">
            <Field label="Cambiar mi correo">
              <input value={correoNuevo} onChange={(e) => setCorreoNuevo(e.target.value)} type="email" maxLength={255}
                placeholder="tu.correo.nuevo@ejemplo.com" className={inputClass} />
            </Field>
            <p className="text-xs text-muted-foreground">
              Es con lo que entras y a donde va la factura de tu comisión. Al cambiarlo se cierra tu sesión y entras con el nuevo; avisamos a administración.
            </p>
            <div className="flex justify-end">
              <button type="submit" className={primaryBtn}
                disabled={cambiandoCorreo || !correoNuevo.trim() || correoNuevo.trim().toLowerCase() === String(user?.email || '').toLowerCase()}>
                {cambiandoCorreo ? 'Cambiando…' : 'Cambiar correo'}
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Change password */}
      <section className="bg-card p-5 rounded-lg border border-border">
        <div className="flex items-center gap-2 mb-4">
          <Lock size={18} weight="regular" className="text-primary" />
          <h3 className="text-base font-semibold">Cambiar contraseña</h3>
        </div>
        <form onSubmit={handlePass(onChangePassword)} className="space-y-4">
          <Field label="Contraseña actual *" error={errPass.current?.message}>
            <input {...regPass('current')} type="password" placeholder="Tu contraseña actual" className={inputClass} />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nueva contraseña *" error={errPass.nueva?.message}>
              <div className="relative">
                <input {...regPass('nueva')} type={showPassword ? 'text' : 'password'} placeholder="8 caracteres, una mayúscula y un número" className={inputClass + ' pr-10'} />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-muted-foreground hover:text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  {showPassword ? <EyeSlash size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </Field>
            <Field label="Confirmar *" error={errPass.confirmar?.message}>
              <input {...regPass('confirmar')} type="password" placeholder="Repite la contraseña" className={inputClass} />
            </Field>
          </div>
          <div className="flex justify-end">
            <button type="submit" disabled={subPass} className={primaryBtn}>
              {subPass ? 'Cambiando…' : 'Cambiar contraseña'}
            </button>
          </div>
        </form>
      </section>

      {/* Cuenta / Preferencias */}
      <section className="bg-card p-5 rounded-lg border border-border">
        <div className="flex items-center gap-2 mb-4">
          {theme === 'dark' ? <Moon size={18} weight="regular" className="text-primary" /> : <Sun size={18} weight="regular" className="text-primary" />}
          <h3 className="text-base font-semibold">Cuenta</h3>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium">Tema de la interfaz</p>
            <p className="text-xs text-muted-foreground mt-0.5">{theme === 'dark' ? 'Modo oscuro activado' : 'Modo claro activado'}</p>
          </div>
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            className="inline-flex items-center justify-center h-9 px-4 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40 shrink-0"
          >
            {theme === 'dark' ? 'Cambiar a claro' : 'Cambiar a oscuro'}
          </button>
        </div>
      </section>

      <Suspense fallback={null}>
        <ConfirmDialog
          open={confirmDeleteAvatar}
          title="¿Eliminar foto de perfil?"
          message="Se eliminará tu foto de perfil y no podrá recuperarse."
          tone="destructive"
          confirmLabel="Eliminar"
          onConfirm={doAvatarDelete}
          onCancel={() => setConfirmDeleteAvatar(false)}
        />
      </Suspense>
    </div>
  );
}
