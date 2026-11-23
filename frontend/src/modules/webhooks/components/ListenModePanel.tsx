import { useEffect, useRef, useState } from 'react';
import { Ear, EarSlash } from '@phosphor-icons/react';
import client from '@/shared/api/client';
import { toast } from '@/shared/hooks/useToast';

interface ListenModePanelProps {
  webhookId: number | null | undefined;
  listening?: boolean;
  onPayloadCaptured?: (payload: Record<string, unknown>) => void;
  onListeningChange?: (listening: boolean) => void;
}

export default function ListenModePanel({
  webhookId,
  listening,
  onPayloadCaptured,
  onListeningChange,
}: ListenModePanelProps) {
  const [polling, setPolling] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (pollRef.current) clearInterval(pollRef.current);
  }, []);

  async function startListening(): Promise<void> {
    if (!webhookId) {
      toast({ title: 'Guarda primero el webhook para iniciar la escucha', variant: 'destructive' });
      return;
    }
    try {
      await client.post(`/forms/${webhookId}/listen`);
      onListeningChange?.(true);
      setPolling(true);
      pollRef.current = setInterval(async () => {
        try {
          const r = await client.get(`/forms/${webhookId}/status`);
          if (r.success && r.data?.sample_payload) {
            if (pollRef.current) clearInterval(pollRef.current);
            setPolling(false);
            onListeningChange?.(false);
            onPayloadCaptured?.(r.data.sample_payload as Record<string, unknown>);
            toast({ title: 'Payload recibido', description: 'Click en cualquier campo del árbol para mapearlo.' });
          }
        } catch {}
      }, 2000);
    } catch (err: any) {
      toast({ title: 'Error', description: err?.data?.error, variant: 'destructive' });
    }
  }

  async function stopListening(): Promise<void> {
    if (webhookId) await client.post(`/forms/${webhookId}/listen/stop`);
    if (pollRef.current) clearInterval(pollRef.current);
    setPolling(false);
    onListeningChange?.(false);
  }

  const isListening = listening || polling;

  return (
    <div className="p-4 rounded-xl border-2 border-dashed border-border bg-muted/10">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-sm">Capturar estructura del payload</p>
          <p className="text-xs text-muted-foreground">
            Pulsa, manda un POST de prueba a la URL, y los campos aparecen para mapear con un click.
          </p>
        </div>
        {!isListening ? (
          <button
            onClick={startListening}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-bold whitespace-nowrap"
          >
            <Ear size={12} weight="bold" /> Esperar payload
          </button>
        ) : (
          <button
            onClick={stopListening}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-warning text-warning-foreground text-xs font-bold whitespace-nowrap animate-pulse"
          >
            <EarSlash size={12} weight="bold" /> Escuchando... (cancelar)
          </button>
        )}
      </div>
      {isListening && (
        <p className="text-xs text-warning mt-2">
          → Manda ahora un POST de prueba a la URL desde tu sistema externo.
        </p>
      )}
    </div>
  );
}
