import {
  FacebookLogo,
  GoogleLogo,
  TiktokLogo,
  MagnifyingGlass,
  Robot,
  Link as LinkIcon,
  UsersThree,
  Globe,
  WhatsappLogo,
  DotsThree,
} from '@phosphor-icons/react';
import { cn } from '@/shared/lib/utils';

/**
 * De donde vino el prospecto.
 *
 * Eran diez colores de marca —azul de Meta, amarillo de Google, rosa de TikTok,
 * verde de WhatsApp...— uno por canal. En una tabla de veinte filas eso es un
 * arcoiris: la columna que mas grita es la que menos hay que mirar.
 *
 * Ahora la etiqueta es neutra y quien identifica el canal es el icono, que ya
 * ES el logotipo de la marca. Se reconoce igual de rapido y deja de competir
 * con el estado, que si tiene color porque si quiere decir algo.
 */

export const CHANNEL_LABELS = {
  meta_ads: 'Meta Ads',
  google_ads: 'Google Ads',
  tiktok_ads: 'TikTok Ads',
  organico: 'Orgánico',
  chatgpt_ia: 'ChatGPT IA',
  directo: 'Directo',
  referido: 'Referido',
  web: 'Web',
  whatsapp: 'WhatsApp',
  otro: 'Otro',
};

const CHANNEL_ICONS = {
  meta_ads: FacebookLogo,
  google_ads: GoogleLogo,
  tiktok_ads: TiktokLogo,
  organico: MagnifyingGlass,
  chatgpt_ia: Robot,
  directo: LinkIcon,
  referido: UsersThree,
  web: Globe,
  whatsapp: WhatsappLogo,
  otro: DotsThree,
};

/**
 * @param {{ channel: string | null | undefined; showIcon?: boolean; className?: string }} props
 */
export default function ChannelBadge({ channel, showIcon = true, className = '' }) {
  const key = channel || 'otro';
  const label = CHANNEL_LABELS[key] || key;
  const Icon = CHANNEL_ICONS[key] || DotsThree;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium',
        'bg-muted text-muted-foreground',
        className,
      )}
    >
      {showIcon && <Icon size={12} weight="bold" />}
      {label}
    </span>
  );
}
