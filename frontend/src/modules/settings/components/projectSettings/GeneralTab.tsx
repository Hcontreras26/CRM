import { useState } from 'react';
import client from '@/shared/api/client';
import Select from '@/shared/components/ui/Select';
import { toast } from '@/shared/hooks/useToast';
import { isValidHexColor } from '@/shared/lib/color';
import { SectionTitle, Field, inputClass, useConfirm } from './shared';

export default function GeneralTab({ project, onSaved }) {
  const { dialog: confirmDialog } = useConfirm();
  const [form, setForm] = useState({
    nombre: project.nombre,
    type: project.type || 'crm',
    dias_alerta_inactividad: project.dias_alerta_inactividad || 3,
    emoji: project.emoji || '',
    logo_url: project.logo_url || '',
    theme_color: project.theme_color || '',
    color_cabecera: project.color_cabecera || '',
    remitente_no_contestar: project.remitente_no_contestar || '',
    meta_account_id: project.meta_account_id || '',
    google_account_id: project.google_account_id || '',
    gsc_property: project.gsc_property || '',
    active: project.active !== false,
    producto_label: project.producto_label || 'Producto',
    producto_label_plural: project.producto_label_plural || 'Productos',
  });
  const [saving, setSaving] = useState(false);

  async function handleSave(e) {
    e.preventDefault();
    // Validar color si está definido
    const trimmedColor = form.theme_color.trim();
    const cabecera = form.color_cabecera.trim();
    if ((trimmedColor && !isValidHexColor(trimmedColor)) || (cabecera && !isValidHexColor(cabecera))) {
      toast({ title: 'Color inválido', description: 'Usa formato #rrggbb (ej. #3b82f6)', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      await client.patch(`/projects/${project.id}`, {
        nombre: form.nombre,
        type: form.type,
        dias_alerta_inactividad: Number(form.dias_alerta_inactividad),
        emoji: form.emoji || null,
        logo_url: form.logo_url ? form.logo_url.trim() : null,
        theme_color: trimmedColor || null,
        color_cabecera: cabecera || null,
        remitente_no_contestar: form.remitente_no_contestar.trim() || null,
        meta_account_id: form.meta_account_id || null,
        google_account_id: form.google_account_id || null,
        gsc_property: form.gsc_property || null,
        active: form.active,
        producto_label: form.producto_label || 'Producto',
        producto_label_plural: form.producto_label_plural || 'Productos',
      });
      toast({ title: 'Cambios guardados' });
      onSaved?.();
    } catch (err) {
      toast({ title: 'Error', description: err?.data?.error || err.message, variant: 'destructive' });
    } finally { setSaving(false); }
  }

  const logoPreviewSrc = form.logo_url?.trim() || null;

  return (
    <form onSubmit={handleSave} className="space-y-5 max-w-2xl">
      <SectionTitle title="Logo del proyecto" subtitle="Pega la URL de la imagen (PNG, JPG, WEBP o SVG)." />
      <div className="flex items-start gap-4 p-4 bg-muted/20 rounded-md border border-border">
        <div className="w-16 h-16 rounded-md bg-card border border-border flex items-center justify-center overflow-hidden flex-shrink-0">
          {logoPreviewSrc ? (
            <img
              src={logoPreviewSrc}
              alt="Preview del logo"
              className="w-full h-full object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <span className="text-2xl">{form.emoji || '📁'}</span>
          )}
        </div>
        <div className="flex-1 space-y-1.5 min-w-0">
          <input
            type="url"
            value={form.logo_url}
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
            placeholder="https://misitio.com/logo.png"
            className={inputClass}
          />
          <p className="text-secundario text-muted-foreground">
            Si la dejas vacia se muestra el emoji. La URL debe ser publica y servir CORS para imagenes.
          </p>
        </div>
      </div>

      <SectionTitle title="Información básica" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Nombre *">
          <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} className={inputClass} required />
        </Field>
        <Field label="Emoji de respaldo" hint="Se muestra si no hay logo">
          <input value={form.emoji} onChange={e => setForm({ ...form, emoji: e.target.value })} className={inputClass} placeholder="🎓" maxLength={4} />
        </Field>
        <Field label="Tipo">
          <Select
            value={form.type}
            onChange={(v) => setForm({ ...form, type: v })}
            options={[
              { value: 'crm', label: 'CRM (leads)' },
              { value: 'ia', label: 'IA (monitor pagos)' },
            ]}
            ariaLabel="Tipo de proyecto"
          />
        </Field>
        <Field label="Alerta inactividad" hint="Dias sin contacto para avisar">
          <input type="number" min="1" max="365" value={form.dias_alerta_inactividad} onChange={e => setForm({ ...form, dias_alerta_inactividad: e.target.value })} className={inputClass} />
        </Field>
      </div>

      <SectionTitle title="Color de marca" subtitle="Se aplica al sidebar, botones y acentos al activar este proyecto. Vacío = color por defecto." />
      <div className="flex items-center gap-3 p-4 bg-muted/20 rounded-md border border-border">
        <input
          type="color"
          value={isValidHexColor(form.theme_color) ? form.theme_color : '#3b56e0'}
          onChange={(e) => setForm({ ...form, theme_color: e.target.value })}
          aria-label="Color de marca"
          className="w-12 h-10 rounded border border-border cursor-pointer flex-shrink-0"
        />
        <input
          type="text"
          value={form.theme_color}
          onChange={(e) => setForm({ ...form, theme_color: e.target.value })}
          placeholder="#3b82f6"
          className={inputClass + ' font-mono text-sm flex-1'}
          maxLength={7}
        />
        {form.theme_color && (
          <button
            type="button"
            onClick={() => setForm({ ...form, theme_color: '' })}
            className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0"
          >
            Quitar
          </button>
        )}
      </div>

      <SectionTitle
        title="Correos y formularios de la marca"
        subtitle="Lo que ven sus alumnos: el correo de feedback y su encuesta. El logo y el color son los de arriba."
      />
      <div className="space-y-3 p-4 bg-muted/20 rounded-md border border-border">
        <Field label="Fondo de la cabecera" hint="Sobre qué color va el logo. Blanco si el logo es de color; oscuro si es la versión blanca. Vacío = blanco.">
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={isValidHexColor(form.color_cabecera) ? form.color_cabecera : '#ffffff'}
              onChange={(e) => setForm({ ...form, color_cabecera: e.target.value })}
              aria-label="Fondo de la cabecera"
              className="w-12 h-10 rounded border border-border cursor-pointer flex-shrink-0"
            />
            <input
              type="text"
              value={form.color_cabecera}
              onChange={(e) => setForm({ ...form, color_cabecera: e.target.value })}
              placeholder="#ffffff"
              className={inputClass + ' font-mono text-sm flex-1'}
              maxLength={7}
            />
            {form.color_cabecera && (
              <button type="button" onClick={() => setForm({ ...form, color_cabecera: '' })}
                className="text-xs text-muted-foreground hover:text-foreground flex-shrink-0">Quitar</button>
            )}
          </div>
        </Field>
        {/* Así se verá la cabecera del correo y de la encuesta. */}
        <div className="overflow-hidden rounded-md border border-border" aria-label="Vista previa de la cabecera">
          <div
            className="flex min-h-[64px] items-center px-5 py-3"
            style={{
              background: isValidHexColor(form.color_cabecera) ? form.color_cabecera : '#ffffff',
              borderBottom: `4px solid ${isValidHexColor(form.theme_color) ? form.theme_color : '#1f4e79'}`,
            }}
          >
            {logoPreviewSrc
              ? <img src={logoPreviewSrc} alt={form.nombre} className="max-h-11 max-w-[200px]" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              : <span className="text-base font-bold text-[#1d2530]">{form.nombre}</span>}
          </div>
          <p className="bg-card px-5 py-2 text-xs text-muted-foreground">Vista previa de la cabecera</p>
        </div>
        <Field
          label="Remitente «no contestar»"
          hint="Del que salen sus correos. Tiene que ser de un dominio autenticado en su cuenta de Brevo (pestaña APIs → Brevo). Vacío = el del CRM."
        >
          <input
            type="email"
            value={form.remitente_no_contestar}
            onChange={(e) => setForm({ ...form, remitente_no_contestar: e.target.value })}
            placeholder="no-responder@sudominio.com"
            className={inputClass}
          />
        </Field>
      </div>

      <SectionTitle title="Terminologia del proyecto" subtitle="Como se llaman &quot;productos&quot; aqui (ej Formacion, Plan, Servicio)" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Producto singular">
          <input value={form.producto_label} onChange={e => setForm({ ...form, producto_label: e.target.value })} className={inputClass} placeholder="Formacion" />
        </Field>
        <Field label="Producto plural">
          <input value={form.producto_label_plural} onChange={e => setForm({ ...form, producto_label_plural: e.target.value })} className={inputClass} placeholder="Formaciones" />
        </Field>
      </div>

      <SectionTitle title="Integraciones publicitarias" subtitle="Opcional; configura si el proyecto usa Meta/Google/GSC" />
      <div className="grid grid-cols-1 gap-3">
        <Field label="Meta Account ID">
          <input value={form.meta_account_id} onChange={e => setForm({ ...form, meta_account_id: e.target.value })} className={inputClass} placeholder="act_123456" />
        </Field>
        <Field label="Google Ads Account ID">
          <input value={form.google_account_id} onChange={e => setForm({ ...form, google_account_id: e.target.value })} className={inputClass} />
        </Field>
        <Field label="GSC Property URL">
          <input value={form.gsc_property} onChange={e => setForm({ ...form, gsc_property: e.target.value })} className={inputClass} placeholder="sc-domain:ejemplo.com" />
        </Field>
      </div>

      <div className="flex items-center justify-between p-3 bg-muted/20 rounded-lg border border-border">
        <div>
          <p className="font-semibold text-sm">Proyecto activo</p>
          <p className="text-xs text-muted-foreground">Desactivar oculta el proyecto del selector</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="sr-only peer" />
          <div className="w-11 h-6 bg-muted rounded-full peer peer-checked:bg-primary peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all" />
        </label>
      </div>

      <div className="flex justify-end pt-2">
        <button type="submit" disabled={saving} className="px-5 py-2.5 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 shadow disabled:opacity-50">
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
      {confirmDialog}
    </form>
  );
}
