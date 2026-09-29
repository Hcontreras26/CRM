import { useEffect, useRef } from 'react';
import useOnlineStatus from '@/shared/hooks/useOnlineStatus';
import { WifiSlash } from '@phosphor-icons/react';
import { toast } from '@/shared/hooks/useToast';

/**
 * Banner persistente cuando el navegador está offline.
 * + Toasts cuando cambia el estado (online ⇄ offline) tras la carga inicial.
 *
 * Se monta una vez en AppLayout — sin props.
 */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  const wasOnlineRef = useRef(online);

  useEffect(() => {
    // Solo emitir toast si cambia tras el mount (no al primer render)
    if (wasOnlineRef.current === online) return;
    wasOnlineRef.current = online;
    if (online) {
      toast({
        title: 'Conexión restaurada',
        description: 'Volvemos a tener internet.',
        duration: 3000,
      });
    } else {
      toast({
        title: 'Sin conexión',
        description: 'Algunas acciones podrían no completarse hasta que vuelvas a estar online.',
        variant: 'destructive',
        duration: 6000,
      });
    }
  }, [online]);

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[55] flex items-center gap-2 px-3 py-2 rounded-full bg-destructive text-destructive-foreground text-xs font-semibold shadow-popover animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <WifiSlash size={14} weight="bold" />
      Sin conexión
    </div>
  );
}
