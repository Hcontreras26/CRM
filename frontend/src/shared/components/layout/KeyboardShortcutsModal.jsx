import { useEffect } from 'react';
import { Keyboard, X } from '@phosphor-icons/react';
import Portal from '@/shared/components/ui/portal';

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);
const cmd = isMac ? '⌘' : 'Ctrl';

const GROUPS = [
  {
    label: 'Generales',
    items: [
      { keys: [cmd, 'K'], description: 'Abrir búsqueda rápida' },
      { keys: [cmd, 'B'], description: 'Contraer / expandir sidebar' },
      { keys: ['?'], description: 'Ver todos los atajos' },
      { keys: ['Esc'], description: 'Cerrar diálogo o popover' },
    ],
  },
  {
    label: 'Navegación rápida',
    description: 'Pulsa G seguido de la tecla',
    items: [
      { keys: ['G', 'D'], description: 'Ir a Dashboard' },
      { keys: ['G', 'L'], description: 'Ir a Prospectos' },
      { keys: ['G', 'C'], description: 'Ir a Clientes' },
      { keys: ['G', 'P'], description: 'Ir a Productos' },
      { keys: ['G', 'R'], description: 'Ir a Reportes' },
      { keys: ['G', 'A'], description: 'Ir a Contabilidad' },
      { keys: ['G', 'S'], description: 'Ir a Configuración' },
    ],
  },
  {
    label: 'Acciones',
    items: [
      { keys: ['N'], description: 'Crear nuevo (según la página actual)' },
      { keys: ['↑', '↓'], description: 'Navegar resultados en búsqueda' },
      { keys: ['↵'], description: 'Seleccionar resultado' },
    ],
  },
];

function Kbd({ children }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-md bg-muted border border-border text-[11px] font-mono font-semibold text-foreground shadow-sm">
      {children}
    </kbd>
  );
}

export default function KeyboardShortcutsModal({ open, onClose }) {
  useEffect(() => {
    if (!open) return;
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <Portal>
      <div role="dialog" aria-label="Atajos de teclado" className="fixed inset-0 !m-0 z-[70] flex items-start justify-center pt-[10vh] sm:pt-[15vh]">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-card rounded-lg border border-border shadow-dialog w-full max-w-lg mx-4 overflow-hidden flex flex-col max-h-[80vh]">
          <header className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2">
              <Keyboard size={18} weight="regular" className="text-muted-foreground" />
              <h2 className="text-sm font-semibold">Atajos de teclado</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-muted transition-colors"
            >
              <X size={16} weight="bold" />
            </button>
          </header>

          <div className="overflow-y-auto p-5 space-y-5 sidebar-scroll">
            {GROUPS.map((group) => (
              <div key={group.label}>
                <div className="mb-2.5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
                    {group.label}
                  </p>
                  {group.description && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">{group.description}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  {group.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between py-1">
                      <span className="text-[13px] text-foreground">{item.description}</span>
                      <div className="flex items-center gap-1">
                        {item.keys.map((k, i) => (
                          <span key={i} className="flex items-center gap-1">
                            {i > 0 && <span className="text-[10px] text-muted-foreground/60 mx-0.5">luego</span>}
                            <Kbd>{k}</Kbd>
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <footer className="px-5 py-3 border-t border-border bg-muted/30 flex-shrink-0">
            <p className="text-[11px] text-muted-foreground">
              Los atajos no funcionan mientras escribes en un campo de texto. Pulsa <Kbd>Esc</Kbd> para salir del campo y volver a usarlos.
            </p>
          </footer>
        </div>
      </div>
    </Portal>
  );
}
