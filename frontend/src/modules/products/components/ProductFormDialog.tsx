
import Field from '@/shared/components/ui/Field';
import { inputClass } from '@/shared/lib/ui';import { useEffect, useState, useRef } from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { productSchema, PAYMENT_LINK_TYPES } from '../validation/product.schema';
import { X, CurrencyEur, Link, Tag, Plus, Trash, Image as ImageIcon, UploadSimple } from '@phosphor-icons/react';
import Portal from '@/shared/components/ui/portal';
import Select from '@/shared/components/ui/Select';
import client from '@/shared/api/client';
import { useProjectContext } from '@/contexts/ProjectContext';
import { useEscapeKey } from '@/shared/hooks/useDialogA11y';
import { uploadProductImage, deleteProductImage, getProductImageUrl } from '../api/products.api';
import { toast } from '@/shared/hooks/useToast';
import CascadaDeCategorias from '@/modules/product-categories/components/CascadaDeCategorias';

import FilaCampos from '@/shared/components/ui/FilaCampos';

const smallInput = 'w-full h-9 px-3 rounded-lg border border-border bg-muted/50 text-sm outline-none focus:border-primary';

export default function ProductFormDialog({ open, onClose, product, onSubmit }) {
  useEscapeKey(onClose, open);
  const { activeProject } = useProjectContext();
  const productoLabel = activeProject?.producto_label || 'Producto';
  const isEdit = !!product;
  const [categories, setCategories] = useState([]);
  const [categoriaSel, setCategoriaSel] = useState('');
  const [subcategoriaSel, setSubcategoriaSel] = useState('');
  const [regimenes, setRegimenes] = useState<any[]>([]);
  const [regimenSel, setRegimenSel] = useState('');
  // Enlaces de pago multiples (CRM-140). El primero queda como stripe_link
  // legacy si el backend aún no soporta product_payment_links.
  const [paymentLinks, setPaymentLinks] = useState([]);
  const [linkErrors, setLinkErrors] = useState({});
  // Estado de imagen — visible solo en modo edicion (necesita product.id para subir).
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(productSchema),
    defaultValues: {
      nombre: '', descripcion: '', precio: '', moneda: 'EUR', stripe_link: '', sku: '', duracion: '', url_info: '',
      horas: '', num_modulos: '', modalidad: '', fecha_inicio_texto: '',
      plazas_totales: '', plazas_ocupadas_previas: '', fecha_cierre_convocatoria: '',
      presentacion_texto: '', objetivos_texto: '', beneficios_texto: '', dirigido_a_texto: '',
      para_que_te_prepara_texto: '', por_que_estudiar_texto: '', modulos_texto: '',
      metodologia_texto: '', faqs_texto: '', profesores_texto: '',
    },
  });

  useEffect(() => {
    if (!open || !activeProject?.id) return;
    (async () => {
      try {
        const res = await client.get(`/product-categories/project/${activeProject.id}`);
        if (res.success) setCategories(res.data || []);
      } catch {}
      try {
        const rr = await client.get(`/invoices/regimenes?projectId=${activeProject.id}`);
        if (rr.success) setRegimenes(rr.data || []);
      } catch {}
    })();
  }, [open, activeProject?.id]);

  useEffect(() => {
    if (open) {
      reset(product ? {
        nombre: product.nombre || '',
        descripcion: product.descripcion || '',
        precio: product.precio || '',
        moneda: product.moneda || 'EUR',
        stripe_link: product.stripe_link || '',
        sku: product.sku || '',
        duracion: product.duracion || '',
        url_info: product.url_info || '',
        horas: product.horas || '',
        num_modulos: product.num_modulos != null ? String(product.num_modulos) : '',
        modalidad: product.modalidad || '',
        fecha_inicio_texto: product.fecha_inicio_texto || '',
        plazas_totales: product.plazas_totales != null ? String(product.plazas_totales) : '',
        plazas_ocupadas_previas: product.plazas_ocupadas_previas ? String(product.plazas_ocupadas_previas) : '',
        // Llega como fecha completa; el <input type="date"> solo entiende AAAA-MM-DD.
        fecha_cierre_convocatoria: product.fecha_cierre_convocatoria
          ? String(product.fecha_cierre_convocatoria).slice(0, 10) : '',
        presentacion_texto: product.presentacion_texto || '',
        objetivos_texto: product.objetivos_texto || '',
        beneficios_texto: product.beneficios_texto || '',
        dirigido_a_texto: product.dirigido_a_texto || '',
        para_que_te_prepara_texto: product.para_que_te_prepara_texto || '',
        por_que_estudiar_texto: product.por_que_estudiar_texto || '',
        modulos_texto: product.modulos_texto || '',
        metodologia_texto: product.metodologia_texto || '',
        faqs_texto: product.faqs_texto || '',
        profesores_texto: product.profesores_texto || '',
      } : {
        nombre: '', descripcion: '', precio: '', moneda: 'EUR', stripe_link: '', sku: '', duracion: '', url_info: '',
        horas: '', num_modulos: '', modalidad: '', fecha_inicio_texto: '',
        plazas_totales: '', plazas_ocupadas_previas: '', fecha_cierre_convocatoria: '',
        presentacion_texto: '', objetivos_texto: '', beneficios_texto: '', dirigido_a_texto: '',
        para_que_te_prepara_texto: '', por_que_estudiar_texto: '', modulos_texto: '',
        metodologia_texto: '', faqs_texto: '', profesores_texto: '',
      });
      setCategoriaSel(product?.categoria_id ? String(product.categoria_id) : '');
      setSubcategoriaSel(product?.subcategoria_id ? String(product.subcategoria_id) : '');
      setRegimenSel(product?.regimen_fiscal_id ? String(product.regimen_fiscal_id) : '');
      // Sincronizar links: usa product.payment_links si viene del backend (CRM-140),
      // sino bootstrap con stripe_link si existe.
      if (Array.isArray(product?.payment_links) && product.payment_links.length > 0) {
        setPaymentLinks(product.payment_links);
      } else if (product?.stripe_link) {
        setPaymentLinks([{ label: 'Pago completo', url: product.stripe_link, tipo: 'completo' }]);
      } else {
        setPaymentLinks([]);
      }
      setLinkErrors({});
    }
  }, [open, product, reset]);

  // Cargar URL firmada de imagen al abrir/cambiar producto.
  useEffect(() => {
    if (!open || !product?.id || !activeProject?.id) {
      setImageUrl(null);
      return;
    }
    if (product.image_url_signed) {
      setImageUrl(product.image_url_signed);
      return;
    }
    if (!product.image_url) {
      setImageUrl(null);
      return;
    }
    let cancelled = false;
    getProductImageUrl(product.id, activeProject.id)
      .then(url => { if (!cancelled) setImageUrl(url); })
      .catch(() => { if (!cancelled) setImageUrl(null); });
    return () => { cancelled = true; };
  }, [open, product?.id, product?.image_url, product?.image_url_signed, activeProject?.id]);

  async function handleImageUpload(file: File) {
    if (!product?.id || !activeProject?.id) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: 'Imagen demasiado grande', description: 'Máximo 5 MB', variant: 'destructive' });
      return;
    }
    setImageUploading(true);
    try {
      const updated = await uploadProductImage(product.id, activeProject.id, file);
      setImageUrl(updated.image_url_signed || null);
      toast({ title: 'Imagen subida' });
    } catch (e: any) {
      toast({ title: 'Error subiendo imagen', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setImageUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleImageRemove() {
    if (!product?.id || !activeProject?.id) return;
    if (!confirm('¿Eliminar la imagen del producto?')) return;
    setImageUploading(true);
    try {
      await deleteProductImage(product.id, activeProject.id);
      setImageUrl(null);
      toast({ title: 'Imagen eliminada' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.response?.data?.error || e.message, variant: 'destructive' });
    } finally {
      setImageUploading(false);
    }
  }

  if (!open) return null;

  function addPaymentLink() {
    setPaymentLinks((prev) => [...prev, { label: '', url: '', tipo: 'completo' }]);
  }
  function updatePaymentLink(idx, patch) {
    setPaymentLinks((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }
  function removePaymentLink(idx) {
    setPaymentLinks((prev) => prev.filter((_, i) => i !== idx));
    setLinkErrors((prev) => {
      const next = { ...prev };
      delete next[idx];
      return next;
    });
  }

  function validateLinks() {
    const errors = {};
    paymentLinks.forEach((l, i) => {
      if (!l.label?.trim()) errors[i] = 'Etiqueta requerida';
      else {
        try { new URL(l.url); } catch { errors[i] = 'URL inválida'; }
      }
    });
    setLinkErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleFormSubmit(data) {
    if (!validateLinks()) return;
    const cleanLinks = paymentLinks.filter((l) => l.label?.trim() && l.url?.trim());
    const payload = {
      ...data,
      precio: data.precio === '' || data.precio === null || Number.isNaN(data.precio) ? null : Number(data.precio),
      categoria_id: categoriaSel ? Number(categoriaSel) : null,
      subcategoria_id: subcategoriaSel ? Number(subcategoriaSel) : null,
      regimen_fiscal_id: regimenSel ? Number(regimenSel) : null,
      // Backwards compat: si solo hay 1 link "completo", también va como stripe_link.
      stripe_link: cleanLinks[0]?.url || data.stripe_link || null,
      payment_links: cleanLinks,
    };
    // Normalizar vacios a null
    ['stripe_link', 'sku', 'duracion', 'url_info'].forEach(k => { if (!payload[k]) payload[k] = null; });
    await onSubmit(payload);
    onClose();
  }

  return (
    <Portal>
    <div role="dialog" aria-label={isEdit ? `Editar ${productoLabel}` : `Nuevo ${productoLabel}`} className="fixed inset-0 !m-0 z-[70] flex items-center justify-center sm:p-4">
      <div className="fixed inset-0 !m-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-card rounded-lg border border-border w-full max-w-2xl mx-4 p-4 sm:p-6 overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold">{isEdit ? `Editar ${productoLabel.toLowerCase()}` : `Nuevo ${productoLabel.toLowerCase()}`}</h2>
            <p className="text-muted-foreground text-sm mt-0.5">{isEdit ? 'Actualiza la información' : 'Registra uno nuevo con precio y detalles'}</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted">
            <X size={18} weight="bold" />
          </button>
        </div>

        <form onSubmit={handleSubmit(handleFormSubmit, (errs) => {
          const msgs = Object.values(errs).map((e: any) => e?.message).filter(Boolean);
          toast({ title: 'Revisa el formulario', description: msgs.join(' · ') || 'Hay campos inválidos', variant: 'destructive' });
        })} className="space-y-3">
          <FilaCampos>
            <Field label="Nombre *" error={errors.nombre?.message}>
              <input {...register('nombre')} placeholder={`Nombre del ${productoLabel.toLowerCase()}`} className={inputClass} />
            </Field>
            <Field label="SKU / código" error={errors.sku?.message}>
              <input {...register('sku')} placeholder="opcional" className={inputClass} />
            </Field>
          </FilaCampos>

          <Field label="Descripción" error={errors.descripcion?.message}>
            <textarea
              {...register('descripcion')}
              placeholder="Descripción corta..."
              rows={2}
              className="w-full px-4 py-3 rounded-md border border-border bg-muted/50 text-sm outline-none resize-none focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card"
            />
          </Field>

          <div className="p-3 bg-muted/20 rounded-md border border-border space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <Tag size={12} /> Categorización
            </div>
            {/* Se escribe o se baja, y son la misma cosa vista de dos maneras (#2).
                Aqui habia un desplegable con TODAS las categorias y su ruta
                entera concatenada —«Cursos › Para Profesionales › Adicciones y
                Conductas Compulsivas», cincuenta y pico lineas— y al lado un
                selector de «subcategoria» del modelo viejo de dos niveles. El
                arbol real tiene cinco, asi que del tercero para abajo no habia
                forma de llegar bajando: o lo buscabas o no existia. */}
            <CascadaDeCategorias
              categorias={categories}
              valor={categoriaSel ? Number(categoriaSel) : null}
              onCambiar={(id) => {
                setCategoriaSel(id ? String(id) : '');
                // `subcategoria_id` es del modelo de dos niveles y hoy solo se
                // usa para ENSEÑAR un nombre en el listado; el filtro va por
                // `categoria_id` y ya baja a los descendientes por su cuenta.
                // Se limpia al tocar la categorizacion —la ruta entera queda en
                // `categoria_id`— pero NO si se edita el precio y nada mas: no
                // se tira un dato que la sincronizacion de WooCommerce puso y
                // que nadie ha pedido cambiar.
                setSubcategoriaSel('');
              }}
            />
            <div>
              <label className="mb-1.5 block px-1 text-secundario text-muted-foreground">Régimen fiscal (IVA)</label>
              <Select<string>
                value={regimenSel}
                onChange={setRegimenSel}
                options={[
                  { value: '', label: 'Por defecto (según ubicación del cliente)' },
                  ...regimenes.map((r: any) => ({ value: String(r.id), label: r.nombre })),
                ]}
                ariaLabel="Régimen fiscal"
              />
              <p className="text-[10px] text-muted-foreground mt-1">
                Déjalo por defecto salvo que el producto tenga un régimen fijo (p. ej. formación exenta de IVA).
              </p>
            </div>
          </div>

          {/* CRM-149: Imagen del producto */}
          <div className="p-3 bg-muted/20 rounded-md border border-border space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <ImageIcon size={12} /> Imagen
            </div>
            {!isEdit ? (
              <p className="text-[11px] text-muted-foreground italic px-1">
                Crea el {productoLabel.toLowerCase()} primero y luego edítalo para añadir la imagen.
              </p>
            ) : (
              <div className="flex items-start gap-3">
                <div className="w-24 h-24 shrink-0 rounded-md border border-border bg-muted/40 overflow-hidden flex items-center justify-center">
                  {imageUrl ? (
                    <img src={imageUrl} alt={product?.nombre || 'Producto'} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon size={28} className="text-muted-foreground/50" />
                  )}
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={imageUploading}
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-xs font-medium hover:bg-muted disabled:opacity-50"
                    >
                      <UploadSimple size={12} weight="bold" />
                      {imageUploading ? 'Subiendo…' : imageUrl ? 'Reemplazar' : 'Subir imagen'}
                    </button>
                    {imageUrl && (
                      <button
                        type="button"
                        disabled={imageUploading}
                        onClick={handleImageRemove}
                        className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-card text-xs font-medium text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 disabled:opacity-50"
                      >
                        <Trash size={12} weight="regular" /> Eliminar
                      </button>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    aria-label="Subir imagen del producto"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f);
                    }}
                  />
                  <p className="text-[10px] text-muted-foreground">PNG, JPG, WEBP o SVG · máx. 5 MB</p>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 bg-muted/20 rounded-md border border-border space-y-3">
            <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <CurrencyEur size={12} /> Precio y venta
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Field label="Precio" error={errors.precio?.message}>
                <input {...register('precio')} type="number" step="0.01" min="0" placeholder="0.00" className={smallInput} />
              </Field>
              <Field label="Moneda">
                <Controller
                  name="moneda"
                  control={control}
                  render={({ field }) => (
                    <Select<string>
                      value={field.value || 'EUR'}
                      onChange={field.onChange}
                      options={[
                        { value: 'EUR', label: 'EUR €' },
                        { value: 'USD', label: 'USD $' },
                        { value: 'MXN', label: 'MXN $' },
                        { value: 'COP', label: 'COP $' },
                      ]}
                      ariaLabel="Moneda"
                    />
                  )}
                />
              </Field>
              <Field label="Duración" hint="ej: 8 sesiones">
                <input {...register('duracion')} placeholder="opcional" className={smallInput} />
              </Field>
            </div>
            <Field label="URL de información / landing" error={errors.url_info?.message}>
              <input {...register('url_info')} placeholder="https://..." className={smallInput} />
            </Field>
          </div>

          {/* === Datos del programa (importados del scraper / WC) === */}
          <div className="p-3 bg-muted/20 rounded-md border border-border space-y-3">
            <div className="text-[11px] font-bold uppercase text-muted-foreground">
              Datos del programa <span className="font-normal normal-case opacity-70">(importados de WP/WC, editables)</span>
            </div>
            <FilaCampos columnas={4}>
              <Field label="Horas">
                <input {...register('horas')} placeholder="ej: 1500 horas" className={smallInput} />
              </Field>
              <Field label="Nº módulos">
                <input {...register('num_modulos')} type="number" min="0" placeholder="ej: 10" className={smallInput} />
              </Field>
              <Field label="Modalidad">
                <input {...register('modalidad')} placeholder="Online, Presencial..." className={smallInput} />
              </Field>
              <Field label="Fecha de inicio">
                <input {...register('fecha_inicio_texto')} placeholder="DD-MM-YYYY" className={smallInput} />
              </Field>
            </FilaCampos>
          </div>

          {/* === Convocatoria: plazas y cierre (#86) === */}
          <div className="p-3 bg-muted/20 rounded-md border border-border space-y-3">
            <div className="text-[11px] font-bold uppercase text-muted-foreground">
              Convocatoria <span className="font-normal normal-case opacity-70">(las plazas salen en las plantillas del proceso comercial)</span>
            </div>
            <FilaCampos columnas={3}>
              <Field label="Plazas de la convocatoria" error={errors.plazas_totales?.message}>
                <input {...register('plazas_totales')} type="number" min="0" placeholder="en blanco: sin cuenta de plazas" className={smallInput} />
              </Field>
              <Field label="Ya ocupadas antes del CRM" error={errors.plazas_ocupadas_previas?.message}>
                <input {...register('plazas_ocupadas_previas')} type="number" min="0" placeholder="0" className={smallInput} />
              </Field>
              <Field label="Cierre de convocatoria" error={errors.fecha_cierre_convocatoria?.message}>
                <input {...register('fecha_cierre_convocatoria')} type="date" className={smallInput} />
              </Field>
            </FilaCampos>
            {/* Las ocupadas y las libres no se teclean: las cuenta el servidor desde
                las ventas. Se enseñan aquí para que se vea el efecto de lo de arriba. */}
            {product && product.plazas_totales != null && (
              <div className="text-[11px] text-muted-foreground">
                Ahora mismo: <strong className="text-foreground">{product.plazas_ocupadas}</strong> ocupadas
                {' · '}
                <strong className={Number(product.plazas_libres) <= 0 ? 'text-destructive' : 'text-foreground'}>
                  {product.plazas_libres}
                </strong>{' '}libres de {product.plazas_totales}.
                {' '}Las ocupadas se cuentan de las ventas, no se escriben.
              </div>
            )}
          </div>

          {/* === Secciones extraídas (texto) === */}
          <div className="p-3 bg-muted/20 rounded-md border border-border space-y-3">
            <div className="text-[11px] font-bold uppercase text-muted-foreground">
              Contenido del programa <span className="font-normal normal-case opacity-70">(extraído del HTML público — se usa para diplomados/recibos)</span>
            </div>
            {[
              { name: 'presentacion_texto', label: 'Presentación' },
              { name: 'objetivos_texto', label: 'Objetivos' },
              { name: 'beneficios_texto', label: 'Beneficios' },
              { name: 'dirigido_a_texto', label: 'A quién va dirigido' },
              { name: 'para_que_te_prepara_texto', label: 'Para qué te prepara' },
              { name: 'por_que_estudiar_texto', label: 'Por qué estudiar' },
              { name: 'modulos_texto', label: 'Módulos / Temario' },
              { name: 'metodologia_texto', label: 'Metodología' },
              { name: 'faqs_texto', label: 'Preguntas frecuentes (FAQs)' },
              { name: 'profesores_texto', label: 'Profesorado' },
            ].map((f) => (
              <details key={f.name} className="border border-border rounded-md bg-card">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium hover:bg-muted/40 flex items-center justify-between">
                  <span>{f.label}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {(product?.[f.name]?.length || 0) > 0 ? `${product[f.name].length} chars` : 'vacío'}
                  </span>
                </summary>
                <div className="px-3 pb-3">
                  <textarea
                    {...register(f.name as any)}
                    rows={6}
                    placeholder={`Pegado por el scraper. Si está vacío puedes editarlo.`}
                    className="w-full px-3 py-2 rounded-md border border-border bg-muted/30 text-xs leading-relaxed resize-y font-sans"
                  />
                </div>
              </details>
            ))}
          </div>

          {/* Enlaces de pago (CRM-140) — soporta múltiples Stripe Payment Links */}
          <div className="p-3 bg-muted/20 rounded-md border border-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
                <Link size={12} /> Enlaces de pago Stripe
                {paymentLinks.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">{paymentLinks.length}</span>
                )}
              </div>
              <button
                type="button"
                onClick={addPaymentLink}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-[11px] font-semibold"
              >
                <Plus size={11} weight="bold" /> Añadir enlace
              </button>
            </div>

            {paymentLinks.length === 0 ? (
              <p className="text-[11px] text-muted-foreground italic px-1">
                Sin enlaces. Añade al menos uno (pago completo, fraccionado, etc.) para que los gestores puedan compartirlo en la conversión.
              </p>
            ) : (
              <div className="space-y-2">
                {paymentLinks.map((link, idx) => (
                  <div key={idx} className="p-3 rounded-md border border-border bg-card space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={link.label}
                        onChange={(e) => updatePaymentLink(idx, { label: e.target.value })}
                        placeholder="Etiqueta (ej: Pago único)"
                        className={smallInput}
                      />
                      <Select<string>
                        value={link.tipo}
                        onChange={(v) => updatePaymentLink(idx, { tipo: v })}
                        options={PAYMENT_LINK_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                        ariaLabel="Tipo de enlace de pago"
                      />
                    </div>
                    <div className="flex gap-2 items-start">
                      <input
                        value={link.url}
                        onChange={(e) => updatePaymentLink(idx, { url: e.target.value })}
                        placeholder="https://buy.stripe.com/..."
                        className={smallInput + ' flex-1 font-mono text-xs'}
                      />
                      <button
                        type="button"
                        onClick={() => removePaymentLink(idx)}
                        aria-label="Eliminar enlace"
                        className="h-9 w-9 inline-flex items-center justify-center rounded-md hover:bg-red-50 dark:hover:bg-red-950/40 text-red-500"
                      >
                        <Trash size={14} weight="regular" />
                      </button>
                    </div>
                    {linkErrors[idx] && (
                      <p className="text-xs text-red-500">{linkErrors[idx]}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground px-1">
              El primer enlace se guarda también como <code className="font-mono">stripe_link</code> por compatibilidad.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="h-9 px-4 rounded-md bg-primary text-white text-sm font-semibold hover:bg-primary/90 shadow disabled:opacity-50">
              {isSubmitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : `Crear ${productoLabel.toLowerCase()}`}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
}
