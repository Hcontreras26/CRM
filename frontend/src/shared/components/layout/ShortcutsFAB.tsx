// FAB que renderiza los `projects.shortcuts` activos del proyecto actual.
// La selección se gestiona en /configuracion/atajos (CRM-235). Cada shortcut
// del catálogo tiene `route` (navega) o `action` (despacha evento custom que
// otros componentes pueden interceptar — e.g. 'open_email_dialog').

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Lightning, X,
  UserPlus, Buildings, Package, FileText, PlugsConnected,
  EnvelopeSimple, Bell, NotePencil, ArrowsClockwise, ChartBar,
  type Icon,
} from '@phosphor-icons/react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/shared/hooks/useToast';

interface ShortcutItem {
  id: string;
  label: string;
  icon: string;
  route?: string;
  action?: string;
  // CRM-147: roles autorizados. Vacio o ausente = visible para todos.
  roles?: string[];
}

const ICON_MAP: Record<string, Icon> = {
  UserPlus,
  Building: Buildings,
  Package,
  FileText,
  Webhook: PlugsConnected,
  Envelope: EnvelopeSimple,
  Bell,
  NotePencil,
  ArrowsClockwise,
  ChartBar,
};

function iconFor(name: string): Icon {
  return ICON_MAP[name] || Lightning;
}

export default function ShortcutsFAB() {
  const navigate = useNavigate();
  const auth = useAuth() as unknown as {
    activeProject: { shortcuts?: ShortcutItem[] | null } | null;
    user: { role?: string } | null;
  };
  const userRole = auth.user?.role;
  // CRM-147: filtrado por rol. Si el shortcut no declara `roles`, es visible
  // para todos (compat hacia atras con configs anteriores al cambio).
  const shortcuts = useMemo<ShortcutItem[]>(() => {
    const all = Array.isArray(auth.activeProject?.shortcuts) ? auth.activeProject.shortcuts : [];
    if (!userRole) return all;
    return all.filter(s => !s.roles || s.roles.length === 0 || s.roles.includes(userRole));
  }, [auth.activeProject?.shortcuts, userRole]);
  const [open, setOpen] = useState(false);

  // Cerrar con Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (shortcuts.length === 0) return null;

  function handleClick(s: ShortcutItem): void {
    setOpen(false);
    if (s.route) {
      navigate(s.route);
      return;
    }
    if (s.action) {
      // Despacha evento custom que componentes específicos pueden escuchar.
      // Si nadie lo intercepta, mostramos un toast informativo.
      let intercepted = false;
      const ev = new CustomEvent('crm:shortcut', {
        detail: { action: s.action, label: s.label },
        cancelable: true,
      });
      const handler = () => { intercepted = true; };
      window.addEventListener('crm:shortcut-handled', handler, { once: true });
      window.dispatchEvent(ev);
      // Tras un tick, si nadie marcó como intercepted, avisa
      setTimeout(() => {
        window.removeEventListener('crm:shortcut-handled', handler);
        if (!intercepted) {
          toast({ title: s.label, description: 'No hay acción disponible aquí — ve a una página relevante' });
        }
      }, 50);
    }
  }

  return (
    <>
      {/* Backdrop cuando abierto */}
      {open && (
        <button
          type="button"
          aria-label="Cerrar atajos"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[55] bg-black/20 animate-in fade-in duration-150"
        />
      )}

      {/* Lista de shortcuts (sale en arco vertical) */}
      <div className="fixed bottom-20 right-4 z-[56] flex flex-col-reverse items-end gap-2 pointer-events-none">
        {open && shortcuts.map((s, i) => {
          const Icon = iconFor(s.icon);
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => handleClick(s)}
              title={s.label}
              style={{ animationDelay: `${i * 30}ms` }}
              className="pointer-events-auto group flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in duration-200 fill-mode-both"
            >
              <span className="px-2.5 py-1 rounded-md bg-card border border-border shadow text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {s.label}
              </span>
              <span className="w-10 h-10 rounded-full bg-card border border-border shadow-md text-foreground hover:bg-primary hover:text-primary-foreground hover:scale-110 transition-all flex items-center justify-center">
                <Icon size={16} weight="duotone" />
              </span>
            </button>
          );
        })}
      </div>

      {/* FAB principal */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={open ? 'Cerrar atajos' : 'Abrir atajos rápidos'}
        aria-expanded={open}
        className={`fixed bottom-4 right-16 z-[57] w-11 h-11 rounded-full shadow-popover transition-all flex items-center justify-center
          ${open
            ? 'bg-card border border-border text-foreground hover:bg-muted'
            : 'bg-primary text-primary-foreground hover:scale-110'
          }`}
      >
        {open ? <X size={18} weight="bold" /> : <Lightning size={18} weight="duotone" />}
      </button>
    </>
  );
}
