import { useState, useEffect, useRef } from 'react';
import { Copy, CheckCircle, Eye, EyeSlash, ArrowsClockwise } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';
import { SectionTitle, useConfirm, inputClass } from './shared';

export default function WebhookTab({ project }) {
  const { ask, dialog: confirmDialog } = useConfirm();
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(null);
  const [apiKey, setApiKey] = useState(project.webhook_api_key);
  const copiedTimeoutRef = useRef(null);
  const baseUrl = window.location.origin + (import.meta.env.BASE_URL || '/crm/').replace(/\/$/, '') + '/api';
  const url = `${baseUrl}/leads/webhooks/${project.slug}`;

  useEffect(() => () => {
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
  }, []);

  async function doCopy(text, key) {
    const { copyToClipboard } = await import('@/shared/lib/clipboard');
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopied(key);
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
      copiedTimeoutRef.current = setTimeout(() => setCopied(null), 2000);
    }
  }

  function regenerate() {
    ask('Regenerar API Key', '¿Regenerar la API Key? La clave anterior dejará de funcionar de inmediato.', async () => {
      try {
        const res = await client.post(`/projects/${project.id}/regenerate-webhook-key`);
        if (res.success && res.data?.webhook_api_key) {
          setApiKey(res.data.webhook_api_key);
          setRevealed(true);
          toast({ title: 'Clave regenerada', description: 'Actualiza las integraciones con la nueva clave' });
        }
      } catch (err) { toast({ title: 'Error', description: err?.data?.error, variant: 'destructive' }); }
    }, 'warning', 'Regenerar');
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <SectionTitle title="Webhook de leads" subtitle="Endpoint HTTP para recibir prospectos desde formularios externos" />

      <div className="space-y-3 bg-muted/30 rounded-md p-4 border border-border">
        <div>
          <label className="text-secundario font-medium text-muted-foreground block mb-1">URL del webhook</label>
          <div className="flex gap-2">
            <input readOnly value={url} className={inputClass + ' font-mono text-xs'} />
            <button onClick={() => doCopy(url, 'url')} className="h-10 px-3 rounded-lg border border-border bg-card text-xs font-semibold hover:bg-muted flex items-center gap-1">
              {copied === 'url' ? <CheckCircle size={12} weight="bold" className="text-success" /> : <Copy size={12} />} Copiar
            </button>
          </div>
        </div>
        <div>
          <label className="text-secundario font-medium text-muted-foreground block mb-1">API Key</label>
          <div className="flex gap-2">
            <input readOnly value={revealed ? apiKey : '•'.repeat(Math.min(40, (apiKey || '').length))} className={inputClass + ' font-mono text-xs'} />
            <button onClick={() => setRevealed(!revealed)} className="h-10 px-3 rounded-lg border border-border bg-card text-xs font-semibold hover:bg-muted">
              {revealed ? <EyeSlash size={14} /> : <Eye size={14} />}
            </button>
            <button onClick={() => doCopy(apiKey, 'key')} className="h-10 px-3 rounded-lg border border-border bg-card text-xs font-semibold hover:bg-muted flex items-center gap-1">
              {copied === 'key' ? <CheckCircle size={12} weight="bold" className="text-success" /> : <Copy size={12} />} Copiar
            </button>
            <button onClick={regenerate} className="h-10 px-3 rounded-lg bg-destructive-soft text-destructive text-xs font-semibold hover:bg-destructive-soft flex items-center gap-1">
              <ArrowsClockwise size={14} weight="bold" /> Regenerar
            </button>
          </div>
        </div>
      </div>

      <SectionTitle title="Como usar el webhook" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-secundario">
        <div className="p-3 rounded-lg bg-muted/40">
          <p className="font-bold mb-1">1. Campos aceptados</p>
          <p className="text-muted-foreground"><code className="font-mono text-secundario">nombre, email, telefono, canal, utm_source, utm_campaign, producto_interes</code></p>
        </div>
        <div className="p-3 rounded-lg bg-muted/40">
          <p className="font-bold mb-1">2. Autenticación</p>
          <p className="text-muted-foreground">Header <code className="font-mono text-secundario">X-API-Key</code> o <code className="font-mono text-secundario">Authorization: Bearer</code></p>
        </div>
        <div className="p-3 rounded-lg bg-muted/40">
          <p className="font-bold mb-1">3. Asignación automática</p>
          <p className="text-muted-foreground">Round-robin entre gestores activos del proyecto</p>
        </div>
        <div className="p-3 rounded-lg bg-muted/40">
          <p className="font-bold mb-1">4. Notificación</p>
          <p className="text-muted-foreground">Email automatico via Brevo al gestor asignado (no bloquea la respuesta)</p>
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}
