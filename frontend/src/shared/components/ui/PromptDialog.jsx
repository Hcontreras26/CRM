import { useState, useEffect, useId, useRef } from 'react';
import Portal from './portal';
import Select from './Select';
import { X, Question } from '@phosphor-icons/react';
import { useModalAccesible } from '@/shared/hooks/useDialogA11y';

/**
 * Dialog de input reutilizable. Reemplazo accesible/estilable de window.prompt().
 *
 * props:
 *  - open: boolean
 *  - title: string
 *  - message: string | ReactNode (descripción)
 *  - placeholder: string
 *  - defaultValue: string
 *  - confirmLabel: string (default 'Aceptar')
 *  - cancelLabel: string (default 'Cancelar')
 *  - multiline: boolean — usa textarea en lugar de input
 *  - options: string[] — si se pasa, renderiza un <select> en lugar de input libre
 *  - required: boolean — bloquea confirmar con valor vacío
 *  - minLength / maxLength: number — límites del texto (recortado); con maxLength sale
 *    un contador y el campo no deja escribir más
 *  - label: string — la etiqueta del campo (por defecto, el título, para lectores de pantalla)
 *  - error: string — un error del servidor: se enseña dentro y el texto escrito se queda
 *  - onConfirm: (value: string) => void
 *  - onCancel: () => void
 *  - loading: boolean
 *
 * Accesible: el foco entra al campo al abrir y vuelve al botón al cerrar, Tab no sale
 * del diálogo y Escape cancela (salvo con `loading`). Ver `useModalAccesible`.
 */
export default function PromptDialog({
  open,
  title,
  message,
  placeholder = '',
  defaultValue = '',
  confirmLabel = 'Aceptar',
  cancelLabel = 'Cancelar',
  multiline = false,
  options = null,
  required = true,
  minLength = 0,
  maxLength = undefined,
  label = undefined,
  error = null,
  onConfirm,
  onCancel,
  loading = false,
}) {
  const [value, setValue] = useState(defaultValue);
  const ref = useRef(null);
  const tituloId = useId();
  const campoId = useId();
  const ayudaId = useId();
  useModalAccesible(ref, { open, onClose: onCancel, bloqueado: loading });

  useEffect(() => {
    if (open) setValue(defaultValue || '');
  }, [open, defaultValue]);

  if (!open) return null;

  const trimmed = value.trim();
  const corto = minLength > 0 && trimmed.length > 0 && trimmed.length < minLength;
  const largo = maxLength != null && trimmed.length > maxLength;
  const canConfirm = !loading && (!required || trimmed.length > 0) && !corto && !largo
    && (!required || trimmed.length >= Math.max(1, minLength));
  const aviso = corto ? `Escribe al menos ${minLength} caracteres.` : largo ? `No puede pasar de ${maxLength} caracteres.` : null;

  function handleSubmit(e) {
    e.preventDefault();
    if (!canConfirm) return;
    onConfirm(trimmed);
  }

  const comunes = {
    id: campoId,
    value,
    onChange: (e) => setValue(e.target.value),
    placeholder,
    maxLength,
    'data-autofocus': true,
    'aria-invalid': !!(aviso || error) || undefined,
    'aria-describedby': ayudaId,
  };

  return (
    <Portal>
      <div className="fixed inset-0 !m-0 z-[80] flex items-center justify-center sm:p-4">
        <div className="fixed inset-0 !m-0 bg-black/60 backdrop-blur-sm" onClick={() => !loading && onCancel?.()} />
        <form
          ref={ref}
          onSubmit={handleSubmit}
          role="dialog"
          aria-modal="true"
          aria-labelledby={tituloId}
          className="relative bg-card sm:rounded-lg border border-border w-full max-w-md flex flex-col"
        >
          <div className="px-5 pt-5 pb-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-md flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                <Question size={20} weight="regular" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id={tituloId} className="text-base font-semibold">{title}</h2>
                {message && <div className="text-sm text-muted-foreground mt-1">{message}</div>}
              </div>
              <button
                type="button"
                onClick={onCancel}
                disabled={loading}
                aria-label="Cerrar"
                className="p-1.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground flex-shrink-0"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-3 sm:ml-[52px]">
              <label htmlFor={campoId} className={label ? 'mb-1 block text-xs font-medium text-muted-foreground' : 'sr-only'}>{label || title}</label>
              {options ? (
                <Select
                  value={value}
                  onChange={setValue}
                  options={[
                    { value: '', label: '— Selecciona —' },
                    ...options.map(opt => (
                      typeof opt === 'object' ? { value: opt.value, label: opt.label } : { value: opt, label: opt }
                    )),
                  ]}
                  ariaLabel={label || title}
                />
              ) : multiline ? (
                <textarea
                  {...comunes}
                  rows={3}
                  className="w-full px-3 py-2 rounded-md border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              ) : (
                <input
                  {...comunes}
                  type="text"
                  className="w-full h-10 px-3 rounded-md border border-border bg-muted/30 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              )}
              <div id={ayudaId} className="mt-1 flex items-start justify-between gap-2 text-xs">
                <span className={aviso ? 'text-destructive' : 'text-muted-foreground'}>
                  {aviso || (minLength > 0 && !trimmed ? `Mínimo ${minLength} caracteres.` : '')}
                </span>
                {maxLength != null && (
                  <span className="flex-none tabular-nums text-muted-foreground" aria-live="polite">{value.length}/{maxLength}</span>
                )}
              </div>
              {error && (
                <div role="alert" className="mt-2 rounded-md border border-destructive/30 bg-destructive-soft px-3 py-2 text-sm text-destructive-soft-foreground">{error}</div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 p-4 border-t border-border bg-muted/20">
            <button
              type="button"
              onClick={onCancel}
              disabled={loading}
              className="inline-flex items-center h-9 px-4 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="submit"
              disabled={!canConfirm}
              className="inline-flex items-center h-9 px-4 rounded-md text-primary-foreground text-sm font-semibold bg-primary hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? 'Procesando…' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </Portal>
  );
}
