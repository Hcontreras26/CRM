import { useState } from 'react';
import { X, Warning } from '@phosphor-icons/react';
import Portal from '@/shared/components/ui/portal';
import Field from '@/shared/components/ui/Field';
import Select from '@/shared/components/ui/Select';
import { inputClass } from '@/shared/lib/ui';
import { cn } from '@/shared/lib/utils';
import { toast } from '@/shared/hooks/useToast';
import {
  webhooksSalientesApi, METODOS_WEBHOOK, opcionesDeAmbito, ambitoDesdeOpcion, opcionDesdeWebhook,
  type WebhookSaliente, type MetodoWebhook, type CampusConEmpresa, type DatosWebhook,
} from '../api/webhooksSalientes.api';

/**
 * Alta y cambio de un webhook de transferencias.
 *
 * EL SECRETO SE ENSEÑA UNA VEZ. Al crear se genera uno (o se pega el del otro
 * sistema) y sale en la pantalla en ese momento; después solo se ve su cola. Al
 * editar, por defecto se mantiene: se puede generar otro o pegar uno nuevo, y
 * ese también se enseña una sola vez.
 */

type ModoSecreto = 'mantener' | 'generar' | 'pegar';

interface Props {
  /** `null` = alta. Un webhook = cambio. */
  webhook: WebhookSaliente | null;
  projectId: number | null;
  issuerId?: number | null;
  proyectos: CampusConEmpresa[];
  esSuperadmin: boolean;
  onCerrar: () => void;
  /** Con `secreto` solo si se acaba de crear o cambiar. */
  onGuardado: (w: WebhookSaliente) => void;
}

export default function DialogoWebhook({
  webhook, projectId, issuerId = null, proyectos, esSuperadmin, onCerrar, onGuardado,
}: Props) {
  const esAlta = webhook === null;
  const [nombre, setNombre] = useState(webhook?.nombre || '');
  const [url, setUrl] = useState(webhook?.url || '');
  const [para, setPara] = useState<string>(() => {
    if (webhook) return opcionDesdeWebhook(webhook);
    if (issuerId) return `e:${issuerId}`;
    // Con un campus elegido se propone SU EMPRESA entera (Diego, 19/10: «debe ser por
    // empresa»); el campus solo sigue a mano en el desplegable. Un campus sin empresa,
    // él mismo.
    const empresa = projectId ? proyectos.find((p) => Number(p.id) === Number(projectId))?.sociedad_emisora_id : null;
    if (empresa) return `e:${empresa}`;
    return projectId ? `c:${projectId}` : '';
  });
  const [metodos, setMetodos] = useState<MetodoWebhook[]>(webhook?.metodos || ['transferencia', 'deposito']);
  const [activo, setActivo] = useState(webhook ? webhook.activo : true);
  const [modoSecreto, setModoSecreto] = useState<ModoSecreto>(esAlta ? 'generar' : 'mantener');
  const [secretoPegado, setSecretoPegado] = useState('');
  const [guardando, setGuardando] = useState(false);

  const urlLimpia = url.trim();
  const errorUrl = urlLimpia && !/^https:\/\//i.test(urlLimpia) ? 'Tiene que empezar por https://' : undefined;
  const errorSecreto = modoSecreto === 'pegar' && secretoPegado.trim() && secretoPegado.trim().length < 16
    ? 'Al menos 16 caracteres' : undefined;
  const falta = !nombre.trim() || !urlLimpia || !!errorUrl || !para || metodos.length === 0
    || (modoSecreto === 'pegar' && (!secretoPegado.trim() || !!errorSecreto));

  const alternarMetodo = (m: MetodoWebhook) =>
    setMetodos((l) => (l.includes(m) ? l.filter((x) => x !== m) : [...l, m]));

  async function guardar() {
    if (falta) return;
    setGuardando(true);
    try {
      const datos: DatosWebhook = {
        nombre: nombre.trim(),
        url: urlLimpia,
        ...ambitoDesdeOpcion(para),
        metodos: METODOS_WEBHOOK.map((m) => m.id).filter((m) => metodos.includes(m)),
        activo,
        ...(modoSecreto === 'pegar' ? { secreto: secretoPegado.trim() } : {}),
        ...(!esAlta && modoSecreto === 'generar' ? { regenerar_secreto: true } : {}),
      };
      const r = esAlta
        ? await webhooksSalientesApi.crear(datos)
        : await webhooksSalientesApi.cambiar(webhook!.id, datos);
      if (!r.success) throw new Error((r as { error?: string }).error || 'no se pudo guardar');
      toast({ title: esAlta ? 'Webhook creado' : 'Webhook guardado' });
      onGuardado(r.data as WebhookSaliente);
    } catch (e: any) {
      toast({ title: 'No se pudo guardar', description: e?.data?.error || e?.message, variant: 'destructive' });
    } finally { setGuardando(false); }
  }

  return (
    <Portal>
      <div className="fixed inset-0 z-50 grid place-items-center p-4 bg-black/60" onClick={onCerrar}>
        <div
          role="dialog" aria-modal="true" aria-label={esAlta ? 'Nuevo webhook de transferencias' : 'Editar webhook de transferencias'}
          className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-md border border-border bg-card shadow-sm"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-5 py-3 border-b border-border">
            <h2 className="font-semibold">{esAlta ? 'Nuevo webhook de transferencias' : `Editar · ${webhook!.nombre}`}</h2>
            <button type="button" onClick={onCerrar} aria-label="Cerrar"
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted">
              <X size={16} />
            </button>
          </div>

          <div className="p-5 space-y-3">
            <Field label="Nombre" required hint="Para reconocerlo en la lista." htmlFor="wh-nombre">
              <input id="wh-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)}
                placeholder="Contabilidad · aviso de transferencias" maxLength={150} className={inputClass} />
            </Field>

            <Field label="URL de destino" required htmlFor="wh-url" error={errorUrl}
              hint="Adónde se manda el aviso, por POST y en JSON. Solo https: el aviso lleva datos del cliente.">
              <input id="wh-url" value={url} onChange={(e) => setUrl(e.target.value)}
                placeholder="https://hook.eu1.make.com/…" autoComplete="off" className={cn(inputClass, 'font-mono')} />
            </Field>

            <Field label="Para quién" required
              hint={para === 'todas'
                ? 'Los cobros de todos los campus de todas las empresas.'
                : para.startsWith('e:') ? 'Los cobros de todos los campus de esa empresa.' : 'Solo los cobros de ese campus.'}>
              <Select
                value={para}
                onChange={setPara}
                options={[{ value: '', label: 'Elige campus, empresa o todas' }, ...opcionesDeAmbito(proyectos, esSuperadmin)]}
                ariaLabel="Para quién"
              />
            </Field>

            <fieldset className="min-w-0">
              <legend className="mb-1.5 block px-1 text-secundario text-muted-foreground">
                Cuándo se envía <span className="text-destructive">*</span>
              </legend>
              <div className="flex flex-wrap gap-3 px-1">
                {METODOS_WEBHOOK.map((m) => (
                  <label key={m.id} className="inline-flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={metodos.includes(m.id)} onChange={() => alternarMetodo(m.id)} />
                    {m.label}
                  </label>
                ))}
              </div>
              <p className="mt-1 px-1 text-[11px] text-muted-foreground">
                Al apuntar un cobro con esta forma de pago. Con tarjeta, Stripe, efectivo, Bizum o PayPal no se envía nunca.
              </p>
            </fieldset>

            <label className="flex items-center gap-2 px-1 text-sm">
              <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
              Encendido
            </label>

            <fieldset className="min-w-0 space-y-2">
              <legend className="mb-1.5 block px-1 text-secundario text-muted-foreground">Secreto para la firma</legend>
              <div className="flex flex-wrap gap-3 px-1 text-sm">
                {!esAlta && (
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" name="wh-secreto" checked={modoSecreto === 'mantener'} onChange={() => setModoSecreto('mantener')} />
                    Mantener el actual{webhook?.secreto_cola ? ` (…${webhook.secreto_cola})` : ''}
                  </label>
                )}
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="wh-secreto" checked={modoSecreto === 'generar'} onChange={() => setModoSecreto('generar')} />
                  {esAlta ? 'Generar uno' : 'Generar uno nuevo'}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="wh-secreto" checked={modoSecreto === 'pegar'} onChange={() => setModoSecreto('pegar')} />
                  Pegar el mío
                </label>
              </div>
              {modoSecreto === 'pegar' && (
                <Field label="Secreto" required htmlFor="wh-secreto-pegado" error={errorSecreto}
                  hint="El que te da el sistema que recibe. Mínimo 16 caracteres.">
                  <input id="wh-secreto-pegado" type="password" value={secretoPegado}
                    onChange={(e) => setSecretoPegado(e.target.value)} autoComplete="off"
                    className={cn(inputClass, 'font-mono')} />
                </Field>
              )}
            </fieldset>

            <p className="flex items-start gap-2 text-[11px] text-muted-foreground bg-muted rounded-md p-2.5">
              <Warning size={13} className="mt-0.5 shrink-0" />
              <span>
                El secreto se guarda cifrado y se enseña <strong>una sola vez</strong>, al guardar. Con él, quien
                recibe comprueba la cabecera <code>X-CRM-Firma</code> y sabe que el aviso viene del CRM.
              </span>
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border">
            <button type="button" onClick={onCerrar}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-bold hover:bg-muted">
              Cancelar
            </button>
            <button type="button" onClick={guardar} disabled={guardando || falta}
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
