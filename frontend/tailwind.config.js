/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Inter, la misma que el body. Antes decia 'Plus Jakarta Sans', que no
        // se descargaba en ninguna parte: `font-sans` caia a la del sistema.
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        // Codigos: factura, NIF, identificadores, claves.
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
          // Pareja suave para etiquetas y avisos: bg-destructive-soft +
          // text-destructive-soft-foreground. Correcta en claro y en oscuro
          // sin escribir la variante dark: en cada sitio.
          soft: 'hsl(var(--destructive-soft))',
          'soft-foreground': 'hsl(var(--destructive-soft-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
          soft: 'hsl(var(--success-soft))',
          'soft-foreground': 'hsl(var(--success-soft-foreground))',
        },
        warning: {
          DEFAULT: 'hsl(var(--warning))',
          foreground: 'hsl(var(--warning-foreground))',
          soft: 'hsl(var(--warning-soft))',
          'soft-foreground': 'hsl(var(--warning-soft-foreground))',
        },
        info: {
          DEFAULT: 'hsl(var(--info))',
          foreground: 'hsl(var(--info-foreground))',
          soft: 'hsl(var(--info-soft))',
          'soft-foreground': 'hsl(var(--info-soft-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        '2xl': 'calc(var(--radius) + 4px)',
        xl: 'calc(var(--radius) + 2px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },

      // La escala del apartado de administración (#50).
      //
      // Sustituye a micro/meta/body, que salieron de medir lo que había —10,
      // 11 y 13px— y no de una decisión. Esta viene decidida y es más calmada:
      // 12 y 14 en vez de 10, 11 y 13. Denso no quiere decir diminuto.
      //
      // Cada nombre dice para qué es, así que no hay que elegir tamaño en cada
      // pantalla: se elige el papel del texto.
      //
      // Sigue sin tocarse `xs`, `sm` ni `base`: redefinirlos movería las 83
      // pantallas a la vez y eso no hay quien lo revise.
      fontSize: {
        // 20px · el título de la pantalla
        titulo: ['1.25rem', { lineHeight: '1.75rem', fontWeight: '600' }],
        // 16px · el título de un bloque dentro de la pantalla
        seccion: ['1rem', { lineHeight: '1.5rem', fontWeight: '600' }],
        // 14px · el texto de siempre
        normal: ['0.875rem', { lineHeight: '1.25rem' }],
        // 12px · lo que acompaña: ayudas, metadatos, pies
        secundario: ['0.75rem', { lineHeight: '1rem' }],
        // 11px · cabecera de tabla. Va con `uppercase`; el espaciado y el peso
        // ya vienen puestos, que a este tamaño en mayúsculas hacen falta.
        tabla: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.06em', fontWeight: '600' }],
        // 28px · las cifras que se miran de lejos. Siempre con tabular-nums.
        cifra: ['1.75rem', { lineHeight: '2.25rem', fontWeight: '600' }],
      },

      // El ritmo de la pantalla (#32).
      //
      // Medido antes de decidir, igual que los radios. Una tarjeta se rellenaba
      // de OCHO maneras distintas —p-4 (110 veces), p-5 (70), p-3 (42), p-6
      // (39), p-8, p-2, p-7, p-12—, y para separar bloques no había ni un valor
      // dominante: space-y-5 (66), space-y-3 (54), space-y-2 (46), space-y-6
      // (31), space-y-4 (31). Esa es la razón de que dos pantallas del mismo CRM
      // no parezcan del mismo CRM aunque los colores ya sean los mismos.
      //
      // Tres nombres, uno por papel. No se elige un número: se elige qué es.
      //
      //   space-y-bloque   entre los bloques de una pantalla
      //   p-tarjeta        relleno de una tarjeta      (lo pone <Card>)
      //   gap-fila         entre controles de una fila
      //
      // La escala numérica de Tailwind sigue estando para los casos sueltos;
      // esto es para las tres decisiones que se repiten en las 82 pantallas.
      spacing: {
        bloque: '1.5rem',   // 24px
        tarjeta: '1rem',    // 16px
        fila: '0.5rem',     // 8px
      },

      // Solo hay TRES profundidades, y cada una dice a qué distancia está la
      // pieza del papel. Había cinco sombras distintas repartidas —`lg`, `xl`,
      // `2xl` y dos copias literales— para dos cosas.
      //
      //   shadow-sm       la tarjeta: está en la página, no encima  (Tailwind)
      //   shadow-popover  un menú o un aviso: flota un poco
      //   shadow-dialog   un diálogo: tapa la pantalla
      //
      // La regla de la maqueta —«tarjetas planas, no cajas flotando»— es sobre
      // la primera. Un diálogo SÍ debe despegarse: la sombra es lo que lo separa
      // de lo que hay debajo.
      boxShadow: {
        popover: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)',
        dialog: '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
