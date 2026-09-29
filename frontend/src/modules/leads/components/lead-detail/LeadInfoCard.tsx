import { useEffect, useState } from 'react';
import { PencilSimple, X, Check, PhoneCall, WhatsappLogo } from '@phosphor-icons/react';
import { useNavigate } from 'react-router-dom';
import { abrirChatCrm } from '@/shared/lib/abrirChatCrm';
import { telefonoParaWhatsapp } from '@/shared/lib/telefono';
import { toast } from '@/shared/hooks/useToast';
import InfoField, { inputClass } from './InfoField';
import type { Lead } from '@/shared/types';

interface LeadInfoCardProps {
  lead: Lead;
  onUpdate: (fields: Partial<Lead>) => Promise<unknown> | unknown;
  /** Apunta la llamada en el historial de contactos. Opcional: sin esto el
   *  boton marca igual, solo que no queda registrada. */
  onLlamada?: (nota: string) => Promise<unknown> | unknown;
  /** Apunta el contacto por WhatsApp. Mismo trato que la llamada. */
  onWhatsapp?: (nota: string) => Promise<unknown> | unknown;
}

const CANAL_OPTIONS = [
  { value: 'directo', label: 'Directo' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'meta_ads', label: 'Meta Ads' },
  { value: 'google_ads', label: 'Google Ads' },
  { value: 'tiktok_ads', label: 'TikTok Ads' },
  { value: 'organico', label: 'Orgánico' },
  { value: 'referido', label: 'Referido' },
  { value: 'chatgpt_ia', label: 'ChatGPT IA' },
];

export default function LeadInfoCard({ lead, onUpdate, onLlamada, onWhatsapp }: LeadInfoCardProps) {
  const navigate = useNavigate();
  const [editMode, setEditMode] = useState(false);
  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [telefono, setTelefono] = useState('');
  const [notas, setNotas] = useState('');
  const [canal, setCanal] = useState('');
  const [loading, setLoading] = useState(false);
  const [llamando, setLlamando] = useState(false);
  const [abriendoWa, setAbriendoWa] = useState(false);

  /**
   * Marca y apunta.
   *
   * El registro va PRIMERO. Al reves, `tel:` cambia de aplicacion y en un movil
   * eso puede congelar la pestaña antes de que salga la peticion: se llamaria
   * sin que quedara constancia, que es justo lo que se viene a resolver.
   */
  /**
   * Abre la conversacion DENTRO del CRM, no wa.me en otra pestaña.
   *
   * Hasta ahora este boton solo estaba en el LISTADO de prospectos: quien
   * entraba en la ficha para mirar el historial tenia que volver atras para
   * escribirle. Es el sitio donde mas falta hace, porque es donde se decide
   * que decirle.
   */
  async function abrirWhatsapp() {
    setAbriendoWa(true);
    try {
      const destino = await abrirChatCrm({ leadId: lead.id, telefono: lead.telefono });
      if (!destino) {
        toast({
          title: 'No se ha podido abrir el chat',
          description: 'Comprueba en WhatsApp · Conexion que tu numero sigue enlazado.',
          variant: 'destructive',
        });
        return;
      }
      // El registro NO puede tragarse su error en silencio: si falla, la gestora
      // habla con la persona creyendo que queda apuntado y en la ficha no hay
      // nada. Se abre el chat igual, pero se dice.
      try {
        await onWhatsapp?.('Contacto por WhatsApp (desde la ficha)');
      } catch {
        toast({
          title: 'El contacto no ha quedado registrado',
          description: 'El chat se abre igual, pero apuntalo a mano.',
          variant: 'destructive',
        });
      }
      navigate(destino);
    } finally { setAbriendoWa(false); }
  }

  async function llamar() {
    setLlamando(true);
    try {
      await onLlamada?.('Llamada desde el móvil (marcada desde la ficha)');
    } catch {
      // Que no quede apuntado no puede impedir llamar: el trabajo es hablar con
      // la persona, no alimentar el historial.
      toast({ title: 'No se pudo apuntar la llamada', description: 'Se marca igual.' });
    } finally {
      setLlamando(false);
      window.location.href = `tel:${String(lead.telefono).replace(/[^0-9+]/g, '')}`;
    }
  }

  useEffect(() => {
    if (editMode && lead) {
      setNombre(lead.nombre || '');
      setEmail(lead.email || '');
      setTelefono(lead.telefono || '');
      setNotas(lead.notas || '');
      setCanal((lead as any).canal_detectado || (lead as any).origen || 'directo');
    }
  }, [editMode, lead]);

  async function handleSave() {
    setLoading(true);
    try {
      const fields: Partial<Lead> & { canal?: string } = {};
      if (nombre !== lead.nombre) fields.nombre = nombre.trim();
      if ((email || '') !== (lead.email || '')) (fields as any).email = email.trim() || null;
      if ((telefono || '') !== (lead.telefono || '')) fields.telefono = telefono.trim() || null;
      if ((notas || '') !== (lead.notas || '')) fields.notas = notas.trim() || null;
      const currentCanal = (lead as any).canal_detectado || (lead as any).origen || 'directo';
      if (canal !== currentCanal) fields.canal = canal;
      if (Object.keys(fields).length === 0) {
        setEditMode(false);
        return;
      }
      const result = await onUpdate(fields);
      if (
        result &&
        typeof result === 'object' &&
        'success' in result &&
        (result as { success?: boolean }).success === false
      ) {
        throw new Error((result as { error?: string }).error || 'No se pudo guardar el prospecto');
      }
      toast({ title: 'Lead actualizado' });
      setEditMode(false);
    } catch (err: unknown) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-card p-5 rounded-lg border border-border">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">Información del prospecto</h3>
        {!editMode ? (
          <button onClick={() => setEditMode(true)} className="text-xs font-semibold text-primary hover:underline flex items-center gap-1.5">
            <PencilSimple size={12} weight="bold" /> Editar
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setEditMode(false)}
              disabled={loading}
              className="text-xs font-semibold text-muted-foreground hover:text-foreground flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted"
            >
              <X size={12} weight="bold" /> Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="text-xs font-semibold text-primary-foreground bg-primary hover:bg-primary/90 flex items-center gap-1.5 px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              <Check size={12} weight="bold" /> {loading ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        )}
      </div>
      {!editMode ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
          <InfoField label="Nombre">{lead.nombre}</InfoField>
          <InfoField label="Email">{lead.email}</InfoField>
          <InfoField label="Teléfono">
            {lead.telefono ? (
              <span className="inline-flex items-center gap-2">
                {lead.telefono}
                {/* Llamar desde la ficha. El CRM prepara, el telefono llama:
                    por WhatsApp no hay canal de audio y por la linea normal el
                    navegador tampoco marca. Lo que aporta es que la llamada
                    QUEDE — hasta ahora las que salian no aparecian en ningun
                    historial y se perdia media conversacion con el prospecto. */}
                <button type="button" onClick={llamar} disabled={llamando}
                  title="Llamar desde el movil y apuntarlo"
                  className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-border
                             text-xs text-muted-foreground hover:text-foreground hover:bg-muted">
                  <PhoneCall size={12} />
                  {llamando ? 'Apuntando…' : 'Llamar'}
                </button>
                {/* Con el criterio del backend: si no hay numero utilizable no
                    se ofrece el boton, en vez de ofrecerlo y que el chat falle. */}
                {telefonoParaWhatsapp(lead.telefono) && (
                  <button type="button" onClick={abrirWhatsapp} disabled={abriendoWa}
                    title="Abrir la conversacion en el CRM"
                    className="inline-flex items-center gap-1 h-6 px-2 rounded-md border border-border
                               text-xs text-muted-foreground hover:text-success hover:bg-muted">
                    <WhatsappLogo size={12} />
                    {abriendoWa ? 'Abriendo…' : 'WhatsApp'}
                  </button>
                )}
              </span>
            ) : 'Sin teléfono'}
          </InfoField>
          <InfoField label="Producto de interés">{lead.producto_nombre || lead.producto_interes || 'Sin producto'}</InfoField>
          <InfoField label="Gestor asignado">{lead.responsable_nombre || 'Sin asignar'}</InfoField>
          <InfoField label="Fecha de solicitud">
            {lead.fecha_solicitud ? new Date(lead.fecha_solicitud).toLocaleString('es-ES') : '--'}
          </InfoField>
          {/* Las etiquetas que la gestora tiene puestas en SU WhatsApp (#138).
              «Quien mira la ficha del prospecto no ve lo que la gestora ya
              sabe» — es literal del ticket, y este es el sitio del que habla.

              NO se mezclan con el estado del prospecto, que está arriba: son de
              otro sitio y las decide otra persona. El ticket lo dice: «se
              enseñan las dos, no se pisa ninguna». Por eso van con borde y sin
              relleno, como en el chat.

              Si no hay ninguna no se pinta el campo: una fila «Sin etiquetas»
              en cada ficha es ruido en el 95 % de los casos. */}
          {(lead.etiquetas_wa || []).length > 0 && (
            <div className="sm:col-span-2">
              <InfoField label="Etiquetas de WhatsApp">
                <span className="flex flex-wrap gap-1.5">
                  {(lead.etiquetas_wa || []).map((e) => (
                    <span
                      key={`${e.instancia}-${e.waId}`}
                      title="Puesta desde WhatsApp, no desde el CRM"
                      className="inline-flex items-center px-2 py-0.5 rounded-full border border-border text-secundario text-muted-foreground"
                    >
                      {e.nombre}
                    </span>
                  ))}
                </span>
              </InfoField>
            </div>
          )}
          {lead.notas && (
            <div className="sm:col-span-2">
              <InfoField label="Notas">{lead.notas}</InfoField>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Nombre</p>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className={inputClass} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Email</p>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              className={inputClass}
            />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Teléfono</p>
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} className={inputClass} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Canal</p>
            <select value={canal} onChange={(e) => setCanal(e.target.value)} className={inputClass}>
              {CANAL_OPTIONS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs text-muted-foreground mb-1.5">Notas</p>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 rounded-md border border-border bg-muted/50 text-sm outline-none resize-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 focus:bg-card placeholder:text-muted-foreground"
            />
          </div>
        </div>
      )}
    </div>
  );
}
