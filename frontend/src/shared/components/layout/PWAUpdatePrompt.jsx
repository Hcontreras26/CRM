import { ArrowsClockwise, X } from '@phosphor-icons/react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export default function PWAUpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  function handleUpdate() {
    updateServiceWorker(true);
  }

  function handleDismiss() {
    setNeedRefresh(false);
  }

  if (!needRefresh) return null;

  return (
    <div
      role="alert"
      className="fixed bottom-24 left-4 right-4 sm:left-auto sm:right-5 sm:w-80 z-50 bg-card border border-primary/30 rounded-xl shadow-dialog p-4 flex items-start gap-3 animate-in slide-in-from-bottom-4 duration-300"
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
        <ArrowsClockwise size={20} weight="duotone" className="text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">Nueva versión disponible</p>
        <p className="text-xs text-muted-foreground mt-0.5">Recarga para aplicar las últimas mejoras.</p>
        <button
          onClick={handleUpdate}
          className="mt-2 flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          <ArrowsClockwise size={14} weight="bold" />
          Recargar ahora
        </button>
      </div>
      <button
        onClick={handleDismiss}
        aria-label="Cerrar"
        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mt-0.5"
      >
        <X size={16} weight="bold" />
      </button>
    </div>
  );
}
