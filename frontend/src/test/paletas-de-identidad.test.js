import { describe, it, expect } from 'vitest';
import { AVATAR_COLORS, ROLE_COLORS, EXPENSE_CATEGORY_COLORS } from '@/shared/lib/ui';

/*
  Las paletas de identidad tienen que seguir siendo distinguibles (#32 · #34).

  Hay tres sitios donde el color NO dice si algo va bien o mal: dice «este es
  este». El avatar de una persona, el color de un rol a medida y la categoría de
  un gasto. En los tres hacen falta varios matices que se distingan entre sí, y
  un token semántico no puede darlo — solo hay cuatro.

  ESTA PRUEBA EXISTE PORQUE ME EQUIVOQUÉ DOS VECES. Migrando el rediseño pasé
  `rose` a `destructive` y `emerald` a `success` en los roles, y ocho de las
  doce categorías de gasto a cuatro tokens. En los dos casos el código seguía
  compilando, las pruebas seguían en verde y la pantalla seguía pintándose: lo
  único que pasaba es que dos cosas distintas se veían igual, que es justo lo
  que esas paletas existen para evitar.

  Un token repetido aquí no es un fallo de estilo. Es una pantalla que deja de
  responder la pregunta para la que se hizo.
*/

const paletas = {
  'avatares': AVATAR_COLORS,
  'roles a medida': ROLE_COLORS,
  'categorías de gasto': EXPENSE_CATEGORY_COLORS,
};

describe('las paletas de identidad no colapsan', () => {
  for (const [nombre, paleta] of Object.entries(paletas)) {
    it(`${nombre}: todos los valores son distintos`, () => {
      const valores = Array.isArray(paleta) ? paleta : Object.values(paleta);
      const repes = valores.filter((v, i) => valores.indexOf(v) !== i);
      // El mensaje nombra al repetido: si falla, dice cuál sin tener que buscar.
      expect(repes.join(' · '), `valores repetidos en ${nombre}`).toBe('');
      expect(new Set(valores).size).toBe(valores.length);
    });

    it(`${nombre}: tiene suficientes para distinguir`, () => {
      const valores = Array.isArray(paleta) ? paleta : Object.values(paleta);
      // Con menos de cuatro no es una paleta: es un token con pasos.
      expect(valores.length).toBeGreaterThanOrEqual(4);
    });
  }
});
