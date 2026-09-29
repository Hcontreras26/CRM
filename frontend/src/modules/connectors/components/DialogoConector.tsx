import { useState } from 'react';
import { X, Warning } from '@phosphor-icons/react';
import Portal from '@/shared/components/ui/portal';
import Field from '@/shared/components/ui/Field';
import Select from '@/shared/components/ui/Select';
import { inputClass } from '@/shared/lib/ui';
import { cn } from '@/shared/lib/utils';
import { toast } from '@/shared/hooks/useToast';
import {
  conectoresApi, TIPOS, DESTINOS, CAMPOS_POR_TIPO,
  type Conector, type TipoConector, type DestinoConector,
} from '../api/connectors.api';

/**
 * Alta y cambio de un conector (#6).
 *
 * LOS SECRETOS SE ESCRIBEN, NO SE LEEN
 *
 * `consumer_secret`, la contrasena de aplicacion y el token no vuelven nunca del
 * servidor — se tapan en el controlador. Asi que al editar salen VACIOS con la
 * nota de que ya hay uno guardado: dejarlo en blanco no lo cambia.
 *
 * Rellenarlos obligaria a traer el secreto entero al navegador solo por abrir un
 * dialogo, que es justo lo que se quito.
 */

/**
 * Lo que hay que advertir al elegir el tipo (#131).
 *
 * Dos de los cinco tipos —los de WooCommerce— hacen algo que ya tiene su propia
 * pantalla en Catálogo, y esa hace más: sincroniza sola cada X minutos y saca el
 * temario de la ficha del curso. Un conector no. Elegir aquí uno de esos sin
 * saberlo es montar la mitad de algo que ya existe entero.
 *
 * No se quitan de la lista: el servidor los admite y siguen siendo útiles para
 * una tienda que no es la del proyecto. Pero se dice.
 */
function avisoDelTipo(tipo: TipoConector): string | undefined {
  if (tipo === 'woocommerce_products' || tipo === 'woocommerce_orders') {
    return 'La tienda del proyecto ya tiene su pantalla en Catálogo → WooCommerce, y esa además sincroniza sola. Esto es para una tienda distinta.';
  }
  return undefined;
}

interface Props {
  /** `null` = alta. Un conector = cambio. */
  conector: Conector | null;
  /** El campus del alta. Sin él (empresa puesta), se elige entre `campus`. */
  projectId: number | null;
  campus?: Array<{ id: number; nombre: string }>;
  onCerrar: () => void;
  onGuardado: () => void;
}

export default function DialogoConector({ conector, projectId, campus = [], onCerrar, onGuardado }: Props) {
  const esAlta = conector === null;
  // Un conector es SIEMPRE de un campus: con la empresa puesta se elige aquí
  // (si la empresa tiene uno solo, ya va puesto).
  const [proyecto, setProyecto] = useState<number | null>(projectId ?? (campus.length === 1 ? campus[0].id : null));

  const [tipo, setTipo] = useState<TipoConector>(conector?.type || 'woocommerce_products');
  const [destino, setDestino] = useState<DestinoConector>(conector?.destination || 'product');
  const [etiqueta, setEtiqueta] = useState(conector?.label || '');
  // Solo lo que NO es secreto viene relleno: es lo unico que el servidor manda.
  const [campos, setCampos] = useState<Record<string, string>>({ ...(conector?.config || {}) });
  const [guardando, setGuardando] = useState(false);

  const definicion = CAMPOS_POR_TIPO[tipo] || [];
  const yaGuardado = conector?.secretos_guardados || {};

  // Al cambiar de tipo en un alta, los campos del anterior no valen.
  const cambiarTipo = (t: TipoConector) => {
    setTipo(t);
    if (esAlta) setCampos({});
  };

  const falta = (esAlta && !proyecto) || definicion.some((c) => {
    if (!c.requerido) return false;
    if (c.secreto) return esAlta ? !campos[c.clave] : !(campos[c.clave] || yaGuardado[c.clave]);
    return !campos[c.clave];
  });

  async function guardar() {
    if (!etiqueta.trim()) { toast({ title: 'Ponle un nombre', variant: 'destructive' }); return; }
    setGuardando(true);
    try {
      // Los secretos en blanco NO se mandan: el servidor fusiona, así que no
      // mandarlos deja el que había. Mandar '' lo borraría.
      const config: Record<string, string> = {};
      for (const c of definicion) {
        const v = (campos[c.clave] ?? '').trim();
        if (c.secreto && !v) continue;
        if (v) config[c.clave] = v;
      }

      const r = esAlta
        ? await conectoresApi.crear({ project_id: proyecto!, type: tipo, label: etiqueta.trim(), destination: destino, config })
        : await conectoresApi.cambiar(conector!.id, { label: etiqueta.trim(), destination: destino, config });

      if (!r.success) throw new Error((r as { error?: string }).error || 'no se pudo guardar');
      toast({
        title: esAlta ? 'Conector creado' : 'Conector guardado',
        description: esAlta ? 'Ahora puedes probar la conexión y ver qué trae.' : undefined,
      });
      onGuardado();
    } catch (e: any) {
      toast({ title: 'No se pudo guardar', description: e?.message, variant: 'destructive' });
    } finally { setGuardando(false); }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60" onClick={onCerrar}>
        <div
          role="dialog" aria-modal="true" aria-label={esAlta ? 'Nuevo conector' : 'Editar conector'}
          className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-md border border-border bg-card shadow-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h2 className="font-semibold">{esAlta ? 'Nuevo conector' : 'Editar conector'}</h2>
            <button type="button" onClick={onCerrar} aria-label="Cerrar"
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
              <X size={16} />
            </button>
          </div>

          {/* `space-y-3`, que es lo que usan los demas dialogos ya convertidos
              —FiscalDataDialog, LeadFormDialog—. La gracia del #106 es que se
              parezcan, asi que el espaciado se copia en vez de elegirse. */}
          <div className="p-5 space-y-3">
            {esAlta && !projectId && (
              <Field label="Campus" required hint="El conector trae los datos a este campus.">
                <Select
                  value={proyecto ? String(proyecto) : ''}
                  onChange={(v: string) => setProyecto(v ? Number(v) : null)}
                  options={[{ value: '', label: 'Elige el campus' }, ...campus.map((p) => ({ value: String(p.id), label: p.nombre }))]}
                  ariaLabel="Campus"
                />
              </Field>
            )}
            {!esAlta && conector?.proyecto && (
              <p className="text-xs text-muted-foreground">Campus: <strong className="text-foreground">{conector.proyecto}</strong></p>
            )}
            <Field label="Nombre" required hint="Para reconocerlo en la lista." htmlFor="conector-nombre">
              <input
                id="conector-nombre"
                value={etiqueta}
                onChange={(e) => setEtiqueta(e.target.value)}
                placeholder="Tienda de Psiko Aprende"
                className={inputClass}
              />
            </Field>

            {/* Estos dos NO van en una FilaCampos, aunque emparejen bien.
                «WooCommerce · productos» no cabe en media anchura de este
                diálogo y sale «WooCommerce · product…», que es justo donde está
                la diferencia con «· pedidos». Una fila que corta la palabra que
                distingue las opciones no ayuda: mejor a lo ancho. */}
            <Field
              label="De dónde trae"
              disabled={!esAlta}
              hint={esAlta ? avisoDelTipo(tipo) : 'El tipo no se cambia: si necesitas otro, crea otro conector.'}
            >
              <Select
                value={tipo}
                onChange={cambiarTipo}
                options={TIPOS.map((t) => ({ value: t.id as TipoConector, label: t.label }))}
                disabled={!esAlta}
                ariaLabel="De dónde trae"
              />
            </Field>
            <Field label="Dónde acaba" hint="A qué parte del CRM van los datos.">
              <Select
                value={destino}
                onChange={setDestino}
                options={DESTINOS.map((d) => ({ value: d.id as DestinoConector, label: d.label }))}
                ariaLabel="Dónde acaba"
              />
            </Field>

            <div className="space-y-3">
              {definicion.map((c) => (
                <Field
                  key={c.clave}
                  label={c.label}
                  required={c.requerido}
                  htmlFor={`conector-${c.clave}`}
                  // Un secreto ya guardado manda sobre la ayuda: es lo único que
                  // hay que saber en ese momento —que dejarlo vacío no lo borra—.
                  hint={c.secreto && yaGuardado[c.clave]
                    ? 'Ya hay uno guardado. Déjalo vacío para no cambiarlo.'
                    : c.ayuda}
                >
                  <input
                    id={`conector-${c.clave}`}
                    type={c.secreto ? 'password' : 'text'}
                    value={campos[c.clave] ?? ''}
                    onChange={(e) => setCampos((p) => ({ ...p, [c.clave]: e.target.value }))}
                    // La ayuda va debajo, en el Field, y no tambien aqui: antes
                    // salia dos veces —«https://mitienda.com» de marcador y otra
                    // vez de pista— y leer lo mismo dos veces hace dudar de si
                    // dicen cosas distintas. El marcador se guarda para lo unico
                    // que la pista no puede decir: que ya hay un secreto puesto.
                    placeholder={c.secreto && yaGuardado[c.clave] ? '•••••••• guardado' : ''}
                    autoComplete="off"
                    // Una dirección o una clave se leen carácter a carácter: un
                    // ck_ de un c k _ mal copiado no se ve en tipografía normal.
                    className={cn(inputClass, 'font-mono')}
                  />
                </Field>
              ))}
            </div>

            {/* El texto va en su propio <span>: si se deja suelto, el <strong>
                pasa a ser OTRO hijo del flex y se va a una columna aparte. */}
            <p className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted rounded-md p-2.5">
              <Warning size={13} className="mt-0.5 shrink-0" />
              <span>
                Las claves se guardan en el servidor y no se vuelven a mostrar. Este conector
                solo <strong>lee</strong>: el CRM nunca escribe en el sitio de origen.
              </span>
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
            <button type="button" onClick={onCerrar}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-bold hover:bg-muted">
              Cancelar
            </button>
            <button type="button" onClick={guardar} disabled={guardando || falta || !etiqueta.trim()}
              title={falta ? 'Faltan campos obligatorios' : undefined}
              className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50">
              {guardando ? 'Guardando…' : esAlta ? 'Crear' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
