import { useEffect, useState, useRef } from 'react';
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
import { avisoDeLoQueFalta, numerosMalEscritos, type Falta } from '@/shared/lib/loQueFalta';
import CascadaDeCategorias from '@/modules/product-categories/components/CascadaDeCategorias';
import Field from '@/shared/components/ui/Field';
import FilaCampos from '@/shared/components/ui/FilaCampos';
import { inputClass } from '@/shared/lib/ui';

// Los campos que pueden fallar al validar, con el nombre que se ve en
// pantalla: el aviso dice EN QUÉ campo está el problema (#106).
const ETIQUETAS: Record<string, string> = {
  nombre: 'Nombre', precio: 'Precio', num_modulos: 'Nº módulos',
  plazas_totales: 'Plazas de la convocatoria', plazas_ocupadas_previas: 'Ya ocupadas antes del CRM',
  url_info: 'URL de información / landing', stripe_link: 'Enlace de pago Stripe',
};

// Cada error del esquema, dicho dentro de la lista de «Faltan datos» como en
// los demás formularios (#106). Antes salía «Nombre: Es obligatorio: escríbelo».
const EN_LA_LISTA: Record<string, string> = {
  'Falta el nombre': 'el nombre',
  'El nombre debe tener al menos 2 caracteres': 'un nombre de al menos 2 letras',
  'Escribe un número entero, 0 o mayor': 'un número entero (0 o más)',
  'El precio no puede ser negativo': 'un precio de 0 o más',
  'Como mucho 2 decimales (céntimos)': 'un precio con 2 decimales como mucho',
  'Como mucho 500 caracteres': '500 caracteres como mucho',
};
function faltaDelEsquema(campo: string, mensaje: string): Falta {
  const etiqueta = ETIQUETAS[campo] || campo;
  return mensaje === 'Falta el nombre'
    ? { title: 'Falta el nombre', description: 'Escríbelo en «Nombre».', que: 'el nombre en «Nombre»' }
    : { title: `Revisa «${etiqueta}»`, description: mensaje, que: `${EN_LA_LISTA[mensaje] || mensaje.toLowerCase()} en «${etiqueta}»` };
}

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
      toast({ title: 'No se pudo subir la imagen', description: e?.response?.data?.error || e.message, variant: 'destructive' });
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
      toast({ title: 'No se pudo eliminar la imagen', description: e?.response?.data?.error || e.message, variant: 'destructive' });
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

  // Los enlaces de pago que fallan, con su número. Se comprueban a la vez que el
  // resto del formulario: antes iban después, y si faltaba el nombre no se
  // decía nada de ellos (visto en la prueba a mano, #106).
  function erroresDeEnlaces(): Falta[] {
    const errors = {};
    const faltan: Falta[] = [];
    paymentLinks.forEach((l, i) => {
      const n = i + 1;
      if (!l.label?.trim()) {
        errors[i] = 'Escribe la etiqueta del enlace';
        faltan.push({ title: 'Falta la etiqueta del enlace', description: `En el enlace ${n}, escribe su etiqueta (ej: Pago único).`, que: `la etiqueta del enlace ${n}` });
      } else {
        try { new URL(l.url); } catch {
          errors[i] = 'La URL no es válida: cópiala entera, empezando por https://';
          faltan.push({ title: 'URL no válida', description: `En el enlace ${n}: cópiala entera, empezando por https://.`, que: `una URL válida en el enlace ${n} (empieza por https://)` });
        }
      }
    });
    // El error se pinta junto al enlace, pero puede quedar fuera de la vista:
    // el aviso dice cuál es (#106).
    setLinkErrors(errors);
    return faltan;
  }

  async function handleFormSubmit(data, evento) {
    const falta = avisoDeLoQueFalta([...numerosMalEscritos(evento?.target), ...erroresDeEnlaces()]);
    if (falta) { toast(falta); return; }
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

        <form onSubmit={handleSubmit(handleFormSubmit, (errs, evento) => {
          const faltan = numerosMalEscritos(evento?.target).concat(Object.entries(errs)
            .filter(([, e]: [string, any]) => typeof e?.message === 'string')
            .map(([k, e]: [string, any]) => faltaDelEsquema(k, e.message))
            // Todo lo que falla, de una vez: también los enlaces de pago (#106).
            .concat(erroresDeEnlaces()));
          toast(avisoDeLoQueFalta(faltan) || { title: 'Revisa el formulario', description: 'Hay campos inválidos', variant: 'destructive' });
        // noValidate: el aviso lo da el esquema, diciendo el campo, y no el
        // globo del navegador (#106).
        })} noValidate className="space-y-3">
          <FilaCampos>
            <Field label="Nombre" htmlFor="producto-nombre" required error={errors.nombre?.message}>
              <input autoComplete="off" id="producto-nombre" {...register('nombre')} placeholder={`Nombre del ${productoLabel.toLowerCase()}`} className={inputClass} />
            </Field>
            <Field label="SKU / código" htmlFor="producto-sku" error={errors.sku?.message}>
              <input autoComplete="off" id="producto-sku" {...register('sku')} placeholder="opcional" className={inputClass} />
            </Field>
          </FilaCampos>

          <Field label="Descripción" htmlFor="producto-descripcion" error={errors.descripcion?.message}>
            <textarea autoComplete="off"
              {...register('descripcion')}
              placeholder="Descripción corta..."
              rows={2}
              id="producto-descripcion"
              className={`${inputClass} h-auto py-2 resize-none`}
            />
          </Field>

          <div className="p-3 bg-muted/20 rounded-md border border-border space-y-3">
            <div className="flex items-center gap-2 text-secundario font-medium text-muted-foreground">
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
            <Field label="Régimen fiscal (IVA)" htmlFor="producto-regimen"
              hint="Déjalo por defecto salvo que el producto tenga un régimen fijo (p. ej. formación exenta de IVA).">
              <Select<string>
                id="producto-regimen"
                value={regimenSel}
                onChange={setRegimenSel}
                options={[
                  { value: '', label: 'Por defecto (según ubicación del cliente)' },
                  ...regimenes.map((r: any) => ({ value: String(r.id), label: r.nombre })),
                ]}
                ariaLabel="Régimen fiscal"
              />
            </Field>
          </div>

          {/* CRM-149: Imagen del producto */}
          <div className="p-3 bg-muted/20 rounded-md border border-border space-y-3">
            <div className="flex items-center gap-2 text-secundario font-medium text-muted-foreground">
              <ImageIcon size={12} /> Imagen
            </div>
            {!isEdit ? (
              <p className="text-secundario text-muted-foreground italic px-1">
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
                  <p className="text-secundario text-muted-foreground">PNG, JPG, WEBP o SVG · máx. 5 MB</p>
                </div>
              </div>
            )}
          </div>

          <div className="p-3 bg-muted/20 rounded-md border border-border space-y-3">
            <div className="flex items-center gap-2 text-secundario font-medium text-muted-foreground">
              <CurrencyEur size={12} /> Precio y venta
            </div>
            <FilaCampos columnas={3}>
              <Field label="Precio" htmlFor="producto-precio" error={errors.precio?.message}>
                <input autoComplete="off" id="producto-precio" {...register('precio')} type="number" step="0.01" min="0" placeholder="0.00" className={inputClass} />
              </Field>
              <Field label="Moneda" htmlFor="producto-moneda">
                <Controller
                  name="moneda"
                  control={control}
                  render={({ field }) => (
                    <Select<string>
                      id="producto-moneda"
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
              <Field label="Duración" htmlFor="producto-duracion" hint="ej: 8 sesiones">
                <input autoComplete="off" id="producto-duracion" {...register('duracion')} placeholder="opcional" className={inputClass} />
              </Field>
            </FilaCampos>
            <Field label="URL de información / landing" htmlFor="producto-url-info" error={errors.url_info?.message}>
              <input autoComplete="off" id="producto-url-info" {...register('url_info')} placeholder="https://..." className={inputClass} />
            </Field>
          </div>

          {/* === Datos del programa (importados del scraper / WC) === */}
          <div className="p-3 bg-muted/20 rounded-md border border-border space-y-3">
            <div className="text-tabla uppercase text-muted-foreground">
              Datos del programa <span className="font-normal normal-case opacity-70">(importados de WP/WC, editables)</span>
            </div>
            <FilaCampos columnas={4}>
              <Field label="Horas" htmlFor="producto-horas">
                <input autoComplete="off" id="producto-horas" {...register('horas')} placeholder="ej: 1500 horas" className={inputClass} />
              </Field>
              <Field label="Nº módulos" htmlFor="producto-num-modulos" error={errors.num_modulos?.message}>
                <input autoComplete="off" id="producto-num-modulos" {...register('num_modulos')} type="number" min="0" placeholder="ej: 10" className={inputClass} />
              </Field>
              <Field label="Modalidad" htmlFor="producto-modalidad">
                <input autoComplete="off" id="producto-modalidad" {...register('modalidad')} placeholder="Online, Presencial..." className={inputClass} />
              </Field>
              <Field label="Fecha de inicio" htmlFor="producto-fecha-inicio-texto">
                <input autoComplete="off" id="producto-fecha-inicio-texto" {...register('fecha_inicio_texto')} placeholder="DD-MM-YYYY" className={inputClass} />
              </Field>
            </FilaCampos>
          </div>

          {/* === Convocatoria: plazas y cierre (#86) === */}
          <div className="p-3 bg-muted/20 rounded-md border border-border space-y-3">
            <div className="text-tabla uppercase text-muted-foreground">
              Convocatoria <span className="font-normal normal-case opacity-70">(las plazas salen en las plantillas del proceso comercial)</span>
            </div>
            <FilaCampos columnas={3}>
              <Field label="Plazas de la convocatoria" htmlFor="producto-plazas-totales" error={errors.plazas_totales?.message}>
                <input autoComplete="off" id="producto-plazas-totales" {...register('plazas_totales')} type="number" min="0" placeholder="en blanco: sin cuenta de plazas" className={inputClass} />
              </Field>
              <Field label="Ya ocupadas antes del CRM" htmlFor="producto-plazas-ocupadas-previas" error={errors.plazas_ocupadas_previas?.message}>
                <input autoComplete="off" id="producto-plazas-ocupadas-previas" {...register('plazas_ocupadas_previas')} type="number" min="0" placeholder="0" className={inputClass} />
              </Field>
              <Field label="Cierre de convocatoria" htmlFor="producto-fecha-cierre-convocatoria" error={errors.fecha_cierre_convocatoria?.message}>
                <input id="producto-fecha-cierre-convocatoria" {...register('fecha_cierre_convocatoria')} type="date" className={inputClass} />
              </Field>
            </FilaCampos>
            {/* Las ocupadas y las libres no se teclean: las cuenta el servidor desde
                las ventas. Se enseñan aquí para que se vea el efecto de lo de arriba. */}
            {product && product.plazas_totales != null && (
              <div className="px-1 text-secundario text-muted-foreground">
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
            <div className="text-tabla uppercase text-muted-foreground">
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
                <summary className="cursor-pointer px-3 py-2 text-sm font-medium hover:bg-muted/40 flex items-center justify-between">
                  <span>{f.label}</span>
                  <span className="text-secundario text-muted-foreground">
                    {(product?.[f.name]?.length || 0) > 0 ? `${product[f.name].length} chars` : 'vacío'}
                  </span>
                </summary>
                <div className="px-3 pb-3">
                  <textarea autoComplete="off"
                    {...register(f.name as any)}
                    rows={6}
                    placeholder={`Pegado por el scraper. Si está vacío puedes editarlo.`}
                    aria-label={f.label}
                    className={`${inputClass} h-auto py-2 resize-y leading-relaxed`}
                  />
                </div>
              </details>
            ))}
          </div>

          {/* Enlaces de pago (CRM-140) — soporta múltiples Stripe Payment Links */}
          <div className="p-3 bg-muted/20 rounded-md border border-border space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-secundario font-medium text-muted-foreground">
                <Link size={12} /> Enlaces de pago Stripe
                {paymentLinks.length > 0 && (
                  <span className="text-tabla px-1.5 py-0.5 rounded bg-primary/10 text-primary font-bold">{paymentLinks.length}</span>
                )}
              </div>
              <button
                type="button"
                onClick={addPaymentLink}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-primary/10 hover:bg-primary/20 text-primary text-secundario font-semibold"
              >
                <Plus size={11} weight="bold" /> Añadir enlace
              </button>
            </div>

            {paymentLinks.length === 0 ? (
              <p className="text-secundario text-muted-foreground italic px-1">
                Sin enlaces. Añade al menos uno (pago completo, fraccionado, etc.) para que los gestores puedan compartirlo en la conversión.
              </p>
            ) : (
              <div className="space-y-2">
                {paymentLinks.map((link, idx) => (
                  <div key={idx} className="p-3 rounded-md border border-border bg-card space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input autoComplete="off"
                        value={link.label}
                        onChange={(e) => updatePaymentLink(idx, { label: e.target.value })}
                        placeholder="Etiqueta (ej: Pago único)"
                        aria-label={`Etiqueta del enlace ${idx + 1}`}
                        aria-invalid={linkErrors[idx] ? true : undefined}
                        className={inputClass}
                      />
                      <Select<string>
                        value={link.tipo}
                        onChange={(v) => updatePaymentLink(idx, { tipo: v })}
                        options={PAYMENT_LINK_TYPES.map((t) => ({ value: t.value, label: t.label }))}
                        ariaLabel="Tipo de enlace de pago"
                      />
                    </div>
                    <div className="flex gap-2 items-start">
                      <input autoComplete="off"
                        value={link.url}
                        onChange={(e) => updatePaymentLink(idx, { url: e.target.value })}
                        placeholder="https://buy.stripe.com/..."
                        aria-label={`URL del enlace ${idx + 1}`}
                        aria-invalid={linkErrors[idx] ? true : undefined}
                        className={`${inputClass} flex-1 min-w-0 font-mono`}
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
                      <p role="alert" className="px-1 text-secundario text-destructive">{linkErrors[idx]}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
            <p className="text-secundario text-muted-foreground px-1">
              El primer enlace se guarda también como <code className="font-mono">stripe_link</code> por compatibilidad.
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="h-9 px-4 rounded-md border border-border bg-card text-sm font-semibold hover:bg-muted">Cancelar</button>
            <button type="submit" disabled={isSubmitting} className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 shadow disabled:opacity-50">
              {isSubmitting ? 'Guardando...' : isEdit ? 'Guardar cambios' : `Crear ${productoLabel.toLowerCase()}`}
            </button>
          </div>
        </form>
      </div>
    </div>
    </Portal>
  );
}
