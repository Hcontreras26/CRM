
import Field from '@/shared/components/ui/Field';
import { useEffect, useState, useCallback } from 'react';
import { inputClass } from '@/shared/lib/ui';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { leadSchema, ORIGEN_OPTIONS, PAIS_OPTIONS, type LeadFormData } from '../validation/lead.schema';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useAuth } from '@/contexts/AuthContext';
import { useProducts } from '@/modules/products/hooks/useProducts';
import { X, Warning, Link as LinkIcon } from '@phosphor-icons/react';
import Portal from '@/shared/components/ui/portal';
import Select from '@/shared/components/ui/Select';
import ProductCombobox from './ProductCombobox';
import client from '@/shared/api/client';
import { useEscapeKey } from '@/shared/hooks/useDialogA11y';
import { detectCountryFromPhone } from '../lib/phoneCountry';
import type { Lead } from '@/shared/types';
import FilaCampos from '@/shared/components/ui/FilaCampos';

interface CustomFieldDef {
  id: number;
  field_key: string;
  label: string;
  type: 'text' | 'number' | 'date' | 'textarea' | 'select' | 'boolean';
  required?: boolean;
  options?: string[];
}

interface DuplicateLead {
  id: number;
  nombre: string;
  email: string;
  status?: string;
  estado?: string;
  created_at: string;
  responsable_id?: number | null;
  responsable_nombre?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  lead: Lead | null;
  onSubmit: (data: LeadFormData & { custom_fields: Record<string, unknown> }) => Promise<void> | void;
}


export default function LeadFormDialog({ open, onClose, lead, onSubmit }: Props) {
  useEscapeKey(onClose, open);
  const isEdit = !!lead;
  const { activeProject, projects, isAllProjects } = useProjectContext() as {
    activeProject: any;
    projects: Array<{ id: number; nombre?: string }>;
    isAllProjects: boolean;
  };
  // En modo "Todos los proyectos" el activeProject es el sentinel (-1).
  // El form NECESITA un proyecto concreto, asi que mostramos un selector
  // al inicio para que el usuario elija a cual asignar el lead.
  const [pickedProjectId, setPickedProjectId] = useState<number | null>(null);
  // Al editar, el proyecto siempre es el del propio lead. Antes, con la vista
  // global "Todos los proyectos", effectiveProjectId quedaba null y Guardar
  // terminaba sin enviar la actualización.
  const effectiveProjectId = isEdit
    ? (lead?.project_id ?? null)
    : (isAllProjects ? pickedProjectId : (activeProject?.id ?? null));
  const effectiveProject = isEdit
    ? (projects || []).find((p) => p.id === lead?.project_id) || activeProject
    : isAllProjects
    ? (projects || []).find((p) => p.id === pickedProjectId) || null
    : activeProject;

  useEffect(() => {
    if (!open) setPickedProjectId(null);
  }, [open]);

  const { user } = useAuth() as any;
  const isGestor = user?.role === 'gestor';
  const { products, refetch: refetchProducts } = useProducts(effectiveProjectId);
  const productoLabel = (effectiveProject as any)?.producto_label || 'Producto';

  const [customFields, setCustomFields] = useState<CustomFieldDef[]>([]);
  const [customValues, setCustomValues] = useState<Record<string, unknown>>({});
  const [duplicates, setDuplicates] = useState<DuplicateLead[]>([]);
  const [pendingDup, setPendingDup] = useState<{
    lead: { id: number; nombre?: string; email?: string; telefono?: string; status?: string; responsable_nombre?: string; created_at?: string; masked?: boolean; message?: string };
    formData: LeadFormData;
    productoInteresId: number | null;
  } | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LeadFormData>({
    resolver: zodResolver(leadSchema),
    defaultValues: {
      nombre: '', email: '', telefono: '', whatsapp_usuario: '',
      origen: 'directo', producto_interes: '', pais: '', notas: '',
    },
  });

  const watchedEmail = watch('email');
  const watchedTelefono = watch('telefono');

  // Que se esta escribiendo: el numero, el usuario, o los dos.
  //
  // Al abrir una ficha que ya tiene usuario se enseña solo, sin que nadie tenga
  // que acordarse de cambiar el desplegable para verlo.
  type ModoContacto = 'numero' | 'usuario' | 'ambos';
  const [modoContacto, setModoContacto] = useState<ModoContacto>('numero');

  // Cargar custom fields al abrir dialog
  useEffect(() => {
    if (!open || !effectiveProjectId) return;
    (async () => {
      try {
        const res = await client.get(`/field-definitions/project/${effectiveProjectId}?entity=lead`);
        if (res.success) setCustomFields(res.data || []);
      } catch {}
    })();
  }, [open, effectiveProjectId]);

  useEffect(() => {
    if (open) {
      setDuplicates([]);
      reset(lead ? {
        nombre: lead.nombre || '',
        email: lead.email || '',
        telefono: lead.telefono || '',
        whatsapp_usuario: lead.whatsapp_usuario || '',
        origen: ((lead.origen as string)?.toLowerCase().replace(' ', '_') || 'directo') as LeadFormData['origen'],
        pais: lead.pais || '',
        producto_interes: lead.producto_interes || '',
        notas: lead.notas || '',
      } : {
        nombre: '', email: '', telefono: '', whatsapp_usuario: '', origen: 'directo', producto_interes: '', notas: '',
      });
      // Si ya tiene usuario, el desplegable se pone solo donde toca: nadie
      // tiene que acordarse de cambiarlo para ver lo que ya estaba guardado.
      setModoContacto(lead?.whatsapp_usuario
        ? (lead.telefono ? 'ambos' : 'usuario')
        : 'numero');
      setCustomValues((lead?.custom_fields as Record<string, unknown>) || {});
    }
  }, [open, lead, reset]);

  // Deteccion de duplicado debounce.
  // Usa /leads/lookup-by-email que IGNORA el filtro RBAC de gestor para
  // que pueda detectar duplicados aunque el lead pertenezca a otra asesora.
  const checkDuplicates = useCallback(async (email: string | undefined): Promise<void> => {
    if (!email || !email.includes('@') || !effectiveProjectId || isEdit) { setDuplicates([]); return; }
    try {
      const res = await client.get(`/leads/lookup-by-email?email=${encodeURIComponent(email)}&projectId=${effectiveProjectId}`);
      if (res.success) {
        setDuplicates((res.data as DuplicateLead[]) || []);
      }
    } catch { setDuplicates([]); }
  }, [effectiveProjectId, isEdit]);

  useEffect(() => {
    const t = setTimeout(() => checkDuplicates(watchedEmail), 600);
    return () => clearTimeout(t);
  }, [watchedEmail, checkDuplicates]);

  if (!open) return null;

  async function handleFormSubmit(data: LeadFormData): Promise<void> {
    if (!effectiveProjectId) {
      // Modo ALL sin proyecto elegido — el banner pide elegirlo
      return;
    }
    // El ProductCombobox guarda el NOMBRE del producto en data.producto_interes,
    // pero el backend acepta producto_interes_id (number). Resolvemos el nombre
    // a ID buscando en el array `products` (case-insensitive trim).
    let producto_interes_id: number | null = null;
    if (data.producto_interes && Array.isArray(products)) {
      const nombre = String(data.producto_interes).trim().toLowerCase();
      const p = products.find((x: any) => String(x.nombre || '').trim().toLowerCase() === nombre);
      if (p) producto_interes_id = p.id;
    }

    if (!isEdit && (data.email || data.telefono)) {
      try {
        const res = await client.post('/leads/check-duplicate', {
          project_id: effectiveProjectId,
          email: data.email || null,
          telefono: data.telefono || null,
          whatsapp_usuario: data.whatsapp_usuario || null,
        }) as { success: boolean; data?: { duplicate: any } };
        if (res?.success && res.data?.duplicate) {
          setPendingDup({ lead: res.data.duplicate, formData: data, productoInteresId: producto_interes_id });
          return;
        }
      } catch { /* si falla, no bloqueamos */ }
    }

    await proceedSubmit(data, producto_interes_id);
  }

  async function proceedSubmit(data: LeadFormData, producto_interes_id: number | null): Promise<void> {
    await onSubmit({
      ...data,
      producto_interes_id,
      custom_fields: customValues,
      _project_id: effectiveProjectId,
    } as any);
    onClose();
  }

  return (
    <Portal>
      <div role="dialog" aria-label={isEdit ? 'Editar prospecto' : 'Nuevo prospecto'} className="fixed inset-0 !m-0 z-[70] flex items-center justify-center sm:p-4">
        <div className="fixed inset-0 !m-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

        <div className="relative bg-card rounded-lg border border-border shadow-[0_20px_25px_-5px_rgb(0_0_0/0.1)] w-full max-w-2xl mx-4 p-4 sm:p-6 overflow-y-auto max-h-[90vh]">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-semibold">{isEdit ? 'Editar prospecto' : 'Nuevo prospecto'}</h2>
              <p className="text-muted-foreground text-sm mt-0.5">{isEdit ? 'Actualiza la información del prospecto' : 'Registra un nuevo prospecto manualmente'}</p>
            </div>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-lg hover:bg-muted">
              <X size={18} weight="bold" />
            </button>
          </div>

          <form onSubmit={handleSubmit(handleFormSubmit)} className="space-y-3">
            {/* En modo "Todos los proyectos": pedimos al usuario que elija
                a qué proyecto pertenece el lead antes de poder rellenar nada. */}
            {isAllProjects && !isEdit && (
              <div className="rounded-md border border-info/30 bg-info-soft p-3">
                <label className="mb-1.5 block px-1 text-secundario font-semibold text-info">
                  Proyecto al que pertenece este prospecto *
                </label>
                <select
                  value={pickedProjectId ?? ''}
                  onChange={(e) => setPickedProjectId(e.target.value ? Number(e.target.value) : null)}
                  className="w-full h-9 px-3 rounded-md border border-border bg-card text-sm"
                  required
                >
                  <option value="">— Elige proyecto —</option>
                  {(projects || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.nombre}</option>
                  ))}
                </select>
                <p className="text-[11px] text-info mt-1.5">
                  Estás en la vista global. El prospecto se creará en el proyecto elegido y aplicará su round-robin.
                </p>
              </div>
            )}
            <FilaCampos>
              <Field label="Nombre *" error={errors.nombre?.message}>
                <input {...register('nombre')} placeholder="Nombre completo" className={inputClass} />
              </Field>
              <Field label="Email" error={errors.email?.message} hint="Opcional si pones teléfono">
                <input {...register('email')} type="email" placeholder="correo@ejemplo.com (opcional)" className={inputClass} />
              </Field>
            </FilaCampos>

            {duplicates.length > 0 && (
              <div className="bg-warning-soft border border-warning/30 rounded-md p-3 flex gap-3 items-start">
                <Warning size={16} weight="fill" className="text-warning flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-warning dark:text-warning">
                    Ya existe {duplicates.length} lead{duplicates.length > 1 ? 's' : ''} con ese email
                  </p>
                  {duplicates.slice(0, 3).map(d => {
                    // Gestor solo puede abrir leads asignados a él/ella.
                    // Si es de otra gestora, mostramos info pero sin link clicable.
                    const isMine = !isGestor || d.responsable_id === user?.id;
                    const responsableLabel = d.responsable_nombre || 'Sin asignar';
                    const inner = (
                      <>
                        <LinkIcon size={10} /> {d.nombre} — {d.status || d.estado} — Asignado a <strong>{responsableLabel}</strong> — {new Date(d.created_at).toLocaleDateString('es-ES')}
                      </>
                    );
                    return isMine ? (
                      <a key={d.id} href={`/crm/leads/${d.id}`} target="_blank" rel="noopener noreferrer"
                        className="text-[11px] text-warning hover:underline flex items-center gap-1 mt-0.5"
                      >{inner}</a>
                    ) : (
                      <div key={d.id} className="text-[11px] text-warning flex items-center gap-1 mt-0.5"
                        title="Este prospecto pertenece a otra asesora — contacta con ella para coordinar"
                      >{inner}</div>
                    );
                  })}
                  {isGestor && duplicates.some(d => d.responsable_id !== user?.id) && (
                    <p className="text-[10px] text-warning mt-1.5 italic">
                      Hay duplicados asignados a otras asesoras. Coordina con ellas antes de crear un registro nuevo.
                    </p>
                  )}
                </div>
              </div>
            )}

            <FilaCampos>
              <Field label="Teléfono" error={errors.telefono?.message} hint="Opcional si pones email">
                <div className="relative">
                  <input {...register('telefono')} placeholder="+34 600 000 000 (opcional)" className={inputClass + ' pr-14'} />
                  {(() => {
                    const c = detectCountryFromPhone(watchedTelefono);
                    if (!c) return null;
                    return (
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-base leading-none pointer-events-none" title={c.name}>
                        {c.flag} <span className="text-[10px] text-muted-foreground align-middle">{c.code}</span>
                      </span>
                    );
                  })()}
                </div>
              </Field>
              <Field label="Origen *" error={errors.origen?.message}>
                <Controller
                  name="origen"
                  control={control}
                  render={({ field }) => (
                    <Select<LeadFormData['origen']>
                      value={field.value}
                      onChange={field.onChange}
                      options={ORIGEN_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                      ariaLabel="Origen"
                    />
                  )}
                />
              </Field>
            </FilaCampos>
              {/* Numero o usuario de WhatsApp.
                  El desplegable elige QUE se esta escribiendo, no «uno u otro
                  para siempre»: la misma persona puede tener los dos, y con
                  «Ambos» se ven los dos campos a la vez.

                  Se valida distinto segun el tipo: un numero lleva prefijo de
                  pais y solo cifras; un usuario no. Validar un usuario con las
                  reglas de un telefono lo rechazaria siempre. */}
              <Field label="Contacto de WhatsApp"
                hint="Elige si tienes su número, su usuario, o los dos">
                {/* El ancho lo ponen las envolturas, NO las clases del campo.
                    Antes el desplegable llevaba `w-40` encima de `inputClass`,
                    que ya trae `w-full`: en la hoja de estilos gana `w-full`, el
                    desplegable ocupaba la fila entera y empujaba el campo del
                    usuario FUERA del dialogo. El campo existia —salia la barra de
                    desplazamiento horizontal— pero no se podia ver ni rellenar,
                    asi que eligiendo «Ambos» solo se podia poner el numero.

                    `min-w-0` en el segundo hace falta: sin el, un elemento flex
                    no baja de su contenido y vuelve a desbordar. */}
                <div className="flex gap-2 items-start">
                  {/* El desplegable del CRM, no el del sistema. Era el unico
                      control del formulario con la flecha del navegador, al
                      lado de «Origen» y «Pais» que llevan la del CRM: un solo
                      campo distinto en un formulario se ve enseguida (#125). */}
                  <div className="w-40 flex-none">
                    <Select<ModoContacto>
                      value={modoContacto}
                      onChange={(v) => setModoContacto(v)}
                      ariaLabel="Qué tienes de WhatsApp"
                      options={[
                        { value: 'numero', label: 'Número' },
                        { value: 'usuario', label: 'Usuario de WhatsApp' },
                        { value: 'ambos', label: 'Ambos' },
                      ]}
                    />
                  </div>
                  {modoContacto !== 'numero' && (
                    <div className="flex-1 min-w-0">
                      <input {...register('whatsapp_usuario')}
                        placeholder="@usuario o como lo tengas guardado"
                        className={inputClass} />
                    </div>
                  )}
                </div>
              </Field>

            <FilaCampos>
              <Field label={`${productoLabel} de interés`}>
                <Controller
                  name="producto_interes"
                  control={control}
                  render={({ field }) => (
                    <ProductCombobox
                      value={field.value}
                      onChange={field.onChange}
                      products={products}
                      projectId={effectiveProjectId}
                      projectLabel={productoLabel}
                      onProductCreated={() => refetchProducts?.()}
                    />
                  )}
                />
              </Field>
              <Field label="País">
                <Controller
                  name="pais"
                  control={control}
                  render={({ field }) => (
                    <Select<string>
                      value={field.value || ''}
                      onChange={field.onChange}
                      options={[
                        { value: '', label: 'Sin especificar' },
                        ...PAIS_OPTIONS.map((p) => ({ value: p, label: p })),
                      ]}
                      ariaLabel="País"
                    />
                  )}
                />
              </Field>
            </FilaCampos>

            {customFields.length > 0 && (
              <div className="border-t border-border pt-3 mt-3 space-y-3">
                <p className="mb-1.5 px-1 text-tabla uppercase text-muted-foreground">Campos personalizados</p>
                <div className="grid grid-cols-2 gap-3">
                  {customFields.map(f => (
                    <div key={f.id} className={f.type === 'textarea' ? 'col-span-2' : ''}>
                      <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">
                        {f.label} {f.required && <span className="text-destructive">*</span>}
                      </label>
                      {f.type === 'textarea' ? (
                        <textarea
                          value={(customValues[f.field_key] as string) || ''}
                          onChange={e => setCustomValues({ ...customValues, [f.field_key]: e.target.value })}
                          required={f.required}
                          className={inputClass + ' h-20 py-2 resize-none'}
                        />
                      ) : f.type === 'select' ? (
                        <Select<string>
                          value={(customValues[f.field_key] as string) || ''}
                          onChange={(v) => setCustomValues({ ...customValues, [f.field_key]: v })}
                          options={[
                            { value: '', label: 'Seleccionar...' },
                            ...(f.options || []).map(o => ({ value: o, label: o })),
                          ]}
                          ariaLabel={f.label}
                        />
                      ) : f.type === 'boolean' ? (
                        <label className="flex items-center gap-2 h-9">
                          <input type="checkbox"
                            checked={!!customValues[f.field_key]}
                            onChange={e => setCustomValues({ ...customValues, [f.field_key]: e.target.checked })}
                          />
                          <span className="text-sm">Si</span>
                        </label>
                      ) : (
                        <input
                          type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                          value={(customValues[f.field_key] as string) || ''}
                          onChange={e => setCustomValues({ ...customValues, [f.field_key]: e.target.value })}
                          required={f.required}
                          className={inputClass}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Field label="Notas">
              <textarea
                {...register('notas')}
                placeholder="Notas adicionales sobre el prospecto..."
                rows={3}
                className="w-full px-4 py-3 rounded-md border border-border bg-muted/50 text-sm outline-none resize-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card placeholder:text-muted-foreground"
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={onClose}
                className="h-9 px-4 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted transition-colors"
              >Cancelar</button>
              <button type="submit" disabled={isSubmitting}
                className="h-9 px-4 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
              >{isSubmitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : 'Crear prospecto'}</button>
            </div>
          </form>
        </div>
      </div>

      {pendingDup && (
        <div role="dialog" aria-label="Prospecto duplicado detectado" className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPendingDup(null)} />
          <div className="relative bg-card border border-border rounded-xl shadow-dialog w-full max-w-md p-6 space-y-4">
            <div>
              <h3 className="text-base font-semibold mb-1">Ya existe un prospecto con estos datos</h3>
              <p className="text-sm text-muted-foreground">
                {pendingDup.lead.masked
                  ? pendingDup.lead.message || 'Existe un lead duplicado asignado a otro gestor.'
                  : 'Se encontró un prospecto que coincide por email o teléfono. ¿Qué quieres hacer?'}
              </p>
            </div>
            <div className="bg-muted/40 border border-border rounded-lg p-3 text-xs space-y-1">
              {pendingDup.lead.masked ? (
                <>
                  {pendingDup.lead.responsable_nombre && <div><span className="text-muted-foreground">Gestor responsable:</span> <span className="font-medium">{pendingDup.lead.responsable_nombre}</span></div>}
                  {pendingDup.lead.status && <div><span className="text-muted-foreground">Estado:</span> {pendingDup.lead.status}</div>}
                  <div className="italic text-muted-foreground/80 pt-1">Contacta con el gestor responsable para coordinar el seguimiento.</div>
                </>
              ) : (
                <>
                  <div><span className="text-muted-foreground">Nombre:</span> <span className="font-medium">{pendingDup.lead.nombre || '--'}</span></div>
                  {pendingDup.lead.email && <div><span className="text-muted-foreground">Email:</span> {pendingDup.lead.email}</div>}
                  {pendingDup.lead.telefono && <div><span className="text-muted-foreground">Teléfono:</span> {pendingDup.lead.telefono}</div>}
                  {pendingDup.lead.responsable_nombre && <div><span className="text-muted-foreground">Gestor:</span> {pendingDup.lead.responsable_nombre}</div>}
                  {pendingDup.lead.status && <div><span className="text-muted-foreground">Estado:</span> {pendingDup.lead.status}</div>}
                </>
              )}
            </div>
            <div className="flex flex-col gap-2 pt-2">
              {!pendingDup.lead.masked && (
                <button type="button"
                  onClick={() => { const id = pendingDup.lead.id; setPendingDup(null); onClose(); const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, ''); window.location.href = `${base}/prospectos/${id}`; }}
                  className="h-9 px-4 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90"
                >Ver prospecto existente</button>
              )}
              <button type="button"
                onClick={async () => { const p = pendingDup; setPendingDup(null); await proceedSubmit(p.formData, p.productoInteresId); }}
                className="h-9 px-4 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted"
              >Crear igualmente (marcar como duplicado)</button>
              <button type="button" onClick={() => setPendingDup(null)}
                className="h-9 px-4 rounded-md text-sm text-muted-foreground hover:bg-muted"
              >Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </Portal>
  );
}
