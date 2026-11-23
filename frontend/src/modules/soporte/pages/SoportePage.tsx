import PageHeader from '@/shared/components/ui/PageHeader';
import { Ticket } from '@phosphor-icons/react';
import { NOVEDADES, NOVEDAD_TYPE } from '../lib/novedades';

const TONE_BG = {
  amber:   'bg-warning-soft text-warning-soft-foreground',
  blue:    'bg-info-soft text-info-soft-foreground',
  emerald: 'bg-success-soft text-success-soft-foreground',
  red:     'bg-destructive-soft text-destructive-soft-foreground',
  violet:  'bg-primary/10 text-primary',
};

export default function SoportePage() {
  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Novedades"
        subtitle="Últimas actualizaciones, mejoras y arreglos del CRM"
      />

      {/* Hint sutil sobre el flotante de tickets */}
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Ticket size={12} weight="regular" className="text-primary" />
        ¿Algo no funciona o tienes una idea? Usa el icono <strong className="text-foreground">flotante</strong> de la esquina inferior derecha para crear un ticket.
      </p>

      {/* Feed de novedades */}
      <div className="space-y-3">
        {NOVEDADES.map((n) => {
          const meta = NOVEDAD_TYPE[n.type] || NOVEDAD_TYPE.feature;
          return (
            <article key={n.id} className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors">
              <header className="flex items-center gap-2 flex-wrap mb-2">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${TONE_BG[meta.tone]}`}>
                  {meta.label}
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">v{n.version}</span>
                <span className="text-[10px] text-muted-foreground/60">·</span>
                <time className="text-[10px] text-muted-foreground">
                  {new Date(n.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                </time>
              </header>
              <h3 className="font-semibold text-sm mb-2">{n.title}</h3>
              {n.highlights?.length > 0 && (
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {n.highlights.map((h, i) => (
                    <li key={i} className="flex items-start gap-2 leading-relaxed">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
