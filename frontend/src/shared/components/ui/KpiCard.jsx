import { TrendUp, TrendDown } from '@phosphor-icons/react';
import { cn } from '@/shared/lib/utils';
import useCountUp from '@/shared/hooks/useCountUp';

/**
 * KpiCard - Tarjeta de KPI reutilizable con animación opt-in.
 *
 * props:
 *  - icon: Componente Phosphor
 *  - iconBg: clase Tailwind con bg + text para el cuadrado del icono
 *  - label: etiqueta superior
 *  - value: valor formateado (string) — backward compatible, sin animación
 *  - numericValue: número crudo — habilita animación count-up
 *  - format: función (n) => string para formatear el número animado
 *  - badge: texto en badge de tendencia (opcional)
 *  - badgeColor: clases Tailwind para el badge
 *  - trend: 'up' | 'down'
 */
function AnimatedValue({ numericValue, format }) {
  const animated = useCountUp(numericValue);
  return <>{format ? format(animated) : Math.round(animated)}</>;
}

export default function KpiCard({
  icon: Icon,
  iconBg = 'bg-primary/10 text-primary',
  label,
  value = null,
  numericValue = undefined,
  format = null,
  badge = null,
  // Por defecto, el tono de «va bien». Con tokens: una sola definicion que
  // ya vale para claro y para oscuro, en vez de dos listas de colores.
  badgeColor = 'bg-success-soft text-success-soft-foreground',
  trend = 'up',
  className = '',
  // tone: prop legacy ignorada (no afecta render). Mantenida para compat
  // con call sites que la pasan; preferir iconBg/badgeColor explícitos.

  tone: _tone = null,
}) {
  const TrendIcon = trend === 'up' ? TrendUp : TrendDown;
  const showBadge = badge && badge !== '--';
  const useAnimation = typeof numericValue === 'number' && Number.isFinite(numericValue);
  return (
    <div
      className={cn(
        'bg-card p-5 rounded-lg border border-border transition-colors hover:border-foreground/20',
        className,
      )}
    >
      <div className="flex items-center justify-between mb-3">
        {Icon && (
          <div className={cn('w-9 h-9 rounded-md flex items-center justify-center', iconBg)}>
            <Icon size={18} weight="regular" />
          </div>
        )}
        {showBadge && (
          <span
            className={cn(
              'text-xs font-medium px-2 py-0.5 rounded inline-flex items-center gap-1',
              badgeColor,
            )}
          >
            <TrendIcon size={12} weight="bold" />
            {badge}
          </span>
        )}
      </div>
      <p className="text-muted-foreground text-sm">{label}</p>
      <h3 className="text-cifra mt-1 tabular-nums">
        {useAnimation ? <AnimatedValue numericValue={numericValue} format={format} /> : value}
      </h3>
    </div>
  );
}
