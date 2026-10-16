import { useId, useRef } from 'react';
import Portal from './portal';
import { useModalAccesible } from '@/shared/hooks/useDialogA11y';
import { X, WarningCircle, Question, Info, CheckCircle } from '@phosphor-icons/react';

// Primera primitiva sobre los tokens de estado (F2 · capa 1). Antes cada tono
// llevaba su color escrito y su variante `dark:` aparte; ahora una clase sirve
// para los dos temas, porque el token ya sabe cuál es en cada uno.
//
// Es el patrón que se replica en el resto de primitivas: nada de `emerald-50` +
// `dark:emerald-950/30`, sino `bg-success-soft` + `text-success-soft-foreground`.
const TONE_STYLES = {
  default: { icon: Question, iconBg: 'bg-primary/10 text-primary', confirmBg: 'bg-primary text-primary-foreground hover:bg-primary/90' },
  destructive: { icon: WarningCircle, iconBg: 'bg-destructive-soft text-destructive-soft-foreground', confirmBg: 'bg-destructive text-destructive-foreground hover:bg-destructive/90' },
  warning: { icon: WarningCircle, iconBg: 'bg-warning-soft text-warning-soft-foreground', confirmBg: 'bg-warning text-warning-foreground hover:bg-warning/90' },
  success: { icon: CheckCircle, iconBg: 'bg-success-soft text-success-soft-foreground', confirmBg: 'bg-success text-success-foreground hover:bg-success/90' },
  info: { icon: Info, iconBg: 'bg-info-soft text-info-soft-foreground', confirmBg: 'bg-info text-info-foreground hover:bg-info/90' },
};

/**
 * Dialog de confirmacion reutilizable.
 *
 * props:
 *  - open: boolean
 *  - title: string
 *  - message: string | ReactNode
 *  - confirmLabel: string (default 'Confirmar')
 *  - cancelLabel: string (default 'Cancelar')
 *  - tone: 'default' | 'destructive' | 'warning' | 'success' | 'info'
 *  - onConfirm: () => void
 *  - onCancel: () => void
 *  - loading: boolean (deshabilita confirm)
 *
 * Accesible: el foco entra al abrir y vuelve al boton al cerrar, Tab no sale del dialogo
 * y Escape cancela (salvo con `loading`). Ver `useModalAccesible`.
 */
export default function ConfirmDialog({
  open, title, message,
  confirmLabel = 'Confirmar', cancelLabel = 'Cancelar',
  tone = 'default', onConfirm, onCancel, loading = false,
}) {
  const ref = useRef(null);
  const tituloId = useId();
  useModalAccesible(ref, { open, onClose: onCancel, bloqueado: loading });
  if (!open) return null;
  const style = TONE_STYLES[tone] || TONE_STYLES.default;
  const Icon = style.icon;

  return (
    <Portal>
      <div className="fixed inset-0 !m-0 z-[80] flex items-center justify-center sm:p-4">
        <div className="fixed inset-0 !m-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onCancel?.()} />
        <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={tituloId} className="relative bg-card sm:rounded-lg border border-border w-full max-w-md flex flex-col">
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 ${style.iconBg}`}>
                <Icon size={20} weight="regular" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id={tituloId} className="text-base font-semibold">{title}</h2>
                {message && <div className="text-sm text-muted-foreground mt-1">{message}</div>}
              </div>
              <button type="button" onClick={onCancel} aria-label="Cerrar" disabled={loading} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex-shrink-0">
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border bg-muted/20">
            <button type="button" data-autofocus onClick={onCancel} disabled={loading}
              className="inline-flex items-center h-9 px-4 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted disabled:opacity-50">
              {cancelLabel}
            </button>
            <button type="button" onClick={onConfirm} disabled={loading}
              className={`inline-flex items-center h-9 px-4 rounded-md text-sm font-semibold disabled:opacity-50 ${style.confirmBg}`}>
              {loading ? 'Procesando…' : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
