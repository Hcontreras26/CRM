import { avatarColorFor } from '@/shared/lib/ui';
import type { ReactNode } from 'react';

export default function InfoField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="text-[13px] font-medium break-words">{children}</div>
    </div>
  );
}

// Era una copia mas, identica de valor. Se reenvia la unica que hay para que
// no vuelva a separarse por el camino.
export { inputClass } from '@/shared/lib/ui';

// La paleta esta en shared/lib/ui.ts. Esta copia no llevaba variante oscura:
// en modo oscuro pintaba un parche claro.
export function avatarColor(id: number | string | null | undefined): string {
  return avatarColorFor(Number(id || 0));
}

export function getInitials(name: string | null | undefined): string {
  if (!name) return '??';
  return name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);
}
