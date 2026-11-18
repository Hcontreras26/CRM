import { useEffect, useState, lazy, Suspense } from 'react';
import { Wrench } from '@phosphor-icons/react';

const TicketsLauncher = lazy(() => import('@/modules/soporte/components/TicketsLauncher'));

const PERSIST_KEY = 'crm.floating-dock-hidden';
const SESSION_KEY = 'crm.floating-dock-session-hidden';

// ===== API publica =====
export function isFloatingDockHidden() {
  if (typeof window === 'undefined') return false;
  if (sessionStorage.getItem(SESSION_KEY) === '1') return true;
  if (localStorage.getItem(PERSIST_KEY) === '1') return true;
  return false;
}

export function setFloatingDockHidden(hidden, mode = 'persist') {
  try {
    if (hidden) {
      if (mode === 'session') {
        sessionStorage.setItem(SESSION_KEY, '1');
        localStorage.removeItem(PERSIST_KEY);
      } else {
        localStorage.setItem(PERSIST_KEY, '1');
        sessionStorage.removeItem(SESSION_KEY);
      }
    } else {
      sessionStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(PERSIST_KEY);
    }
  } catch {}
  window.dispatchEvent(new Event('crm:floating-dock-changed'));
}

/**
 * Wrapper de las herramientas flotantes: el soporte (tickets). El Chat IA ya
 * no va aquí: las pantallas de IA del CRM están apagadas (#30, Diego 10/11).
 * El toggle de visibilidad vive en el menu de avatar (sidebar).
 * Cuando estan ocultas se muestra una pildora pequena en la esquina para restaurar.
 */
export default function FloatingDock() {
  const [hidden, setHidden] = useState(() => isFloatingDockHidden());

  useEffect(() => {
    function onChange() { setHidden(isFloatingDockHidden()); }
    function onStorage(e) {
      if (e.key === PERSIST_KEY || e.key === SESSION_KEY) setHidden(isFloatingDockHidden());
    }
    window.addEventListener('crm:floating-dock-changed', onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('crm:floating-dock-changed', onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setFloatingDockHidden(false)}
        aria-label="Mostrar herramientas flotantes"
        title="Mostrar herramientas (soporte)"
        className="fixed bottom-4 right-4 z-50 w-9 h-9 rounded-full bg-card border border-border shadow-md text-muted-foreground hover:text-foreground hover:bg-muted hover:scale-110 transition-all flex items-center justify-center"
      >
        <Wrench size={14} weight="regular" />
      </button>
    );
  }

  return (
    <Suspense fallback={null}>
      <TicketsLauncher />
    </Suspense>
  );
}
