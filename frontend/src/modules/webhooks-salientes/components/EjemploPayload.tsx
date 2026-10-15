import { useEffect, useState } from 'react';
import { CaretDown, CaretRight, Copy } from '@phosphor-icons/react';
import { toast } from '@/shared/hooks/useToast';
import { copyToClipboard } from '@/shared/lib/clipboard';
import { webhooksSalientesApi, type EjemploWebhook } from '../api/webhooksSalientes.api';

/**
 * «Qué se envía», desplegable: las cabeceras, cómo comprobar la firma y un
 * payload de ejemplo. El ejemplo lo da el servidor, con el mismo código que
 * arma los de verdad: si un día cambia un campo, aquí cambia solo.
 */

const COMPROBAR_FIRMA = `// Node.js: comprobar que el aviso viene del CRM
const crypto = require('crypto');
const esperada = 'sha256=' + crypto
  .createHmac('sha256', process.env.SECRETO_DEL_WEBHOOK)
  .update(cuerpoEnBruto)            // el cuerpo tal cual llegó, sin volver a serializarlo
  .digest('hex');
const valida = crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(req.headers['x-crm-firma']));`;

export default function EjemploPayload() {
  const [abierto, setAbierto] = useState(false);
  const [ejemplo, setEjemplo] = useState<EjemploWebhook | null>(null);

  useEffect(() => {
    if (!abierto || ejemplo) return;
    webhooksSalientesApi.ejemplo()
      .then((r: { success?: boolean; data?: EjemploWebhook }) => { if (r.success && r.data) setEjemplo(r.data); })
      .catch(() => { /* el bloque dice «Cargando…» y ya */ });
  }, [abierto, ejemplo]);

  const json = ejemplo ? JSON.stringify(ejemplo.payload, null, 2) : '';

  return (
    <section className="rounded-md border border-border bg-card">
      <button type="button" onClick={() => setAbierto((v) => !v)} aria-expanded={abierto}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold hover:bg-muted/50">
        {abierto ? <CaretDown size={14} /> : <CaretRight size={14} />}
        Qué se envía: cabeceras, firma y un ejemplo
      </button>
      {abierto && (
        <div className="space-y-3 border-t border-border px-4 py-3 text-xs">
          <p className="text-muted-foreground">
            Un <strong>POST</strong> en JSON a la URL del webhook, en cuanto se apunta el cobro. Si el destino no contesta
            con un 2xx se reintenta hasta tres veces más (a 1, 5 y 15 minutos); los cortes de red, los 5xx, el 408 y el
            429 se reintentan, otro 4xx no. El mismo cobro no se manda dos veces al mismo webhook: usa
            la <code>idempotency_key</code> para no contarlo dos veces si lo recibes en un reintento.
          </p>

          <div>
            <p className="mb-1 font-semibold">Cabeceras</p>
            <ul className="space-y-0.5">
              {(ejemplo?.cabeceras || []).map((c) => (
                <li key={c.nombre}><code className="font-semibold">{c.nombre}</code>: <span className="text-muted-foreground">{c.valor}</span></li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-1 font-semibold">Comprobar la firma</p>
            <pre className="overflow-auto rounded bg-muted p-2 text-[11px] leading-snug">{COMPROBAR_FIRMA}</pre>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between">
              <p className="font-semibold">Ejemplo de payload <span className="font-normal text-muted-foreground">(datos inventados)</span></p>
              {json && (
                <button type="button"
                  onClick={async () => toast({ title: (await copyToClipboard(json)) ? 'Ejemplo copiado' : 'No se pudo copiar' })}
                  className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-card px-2 text-[11px] font-bold hover:bg-muted">
                  <Copy size={12} /> Copiar
                </button>
              )}
            </div>
            <pre className="max-h-96 overflow-auto rounded bg-muted p-2 text-[11px] leading-snug">{json || 'Cargando…'}</pre>
            <p className="mt-1 text-muted-foreground">
              <code>evento</code> es <code>cobro.transferencia</code> o <code>cobro.deposito</code>. Las pruebas llevan
              {' '}<code>&quot;prueba&quot;: true</code>. <code>empresa</code>, <code>cuenta_destino</code>, <code>gestora</code> y
              {' '}<code>registrado_por</code> van a <code>null</code> cuando no hay dato.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
