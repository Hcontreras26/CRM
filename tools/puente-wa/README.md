# Puente de WhatsApp (Baileys)

Un servidor local que **imita los endpoints de Evolution API** usando Baileys,
para poder trabajar en el modulo de WhatsApp sin levantar Docker.

```
Navegador ──▶ CRM (Express) ──▶ puente / Evolution ──▶ WhatsApp
                   ▲                    │
                   └──── webhook ───────┘
```

En el VPS corre **Evolution en Docker**. En local, esto. El CRM no distingue
cual de los dos hay detras — y ahi esta el peligro.

## LO QUE HAY QUE SABER ANTES DE TOCAR NADA

**El puente no es Evolution. Hace menos, y no lo dice.**

Esto no es teorico. En una sola sesion de pruebas con un numero real salieron
cinco diferencias, y ninguna daba error:

| Que | Que pasaba |
|---|---|
| `jidDe()` forzaba `@s.whatsapp.net` siempre | A un grupo no llegaba nada, y el eco creaba una conversacion fantasma |
| No mandaba `participant` | En un grupo, todos los mensajes salian sin autor |
| No implementaba `/chat/updateMessage` | «Este WhatsApp no permite corregir mensajes» |
| El `caption` no iba en documentos | Mandar un dossier con mensaje llegaba como PDF pelado |
| Nunca implemento `groupsIgnore` | El CRM creia estar filtrando grupos y no filtraba nada |

Y al reves tambien pasa: el puente llego a exponer `/chat/presence` y `/agenda`,
que **no existen en Evolution**. El CRM los llamaba en bucle y en produccion eran
136 errores en diez minutos tapando los errores de verdad (tarea #63).

### Las dos reglas

1. **Si Evolution no lo tiene, el puente tampoco.** Un puente mas generoso que el
   original convierte cada prueba en una mentira comoda.
2. **Si Evolution lo tiene, el puente tambien.** Si no, se «arregla» algo del CRM
   que en realidad faltaba aqui — que es lo que paso con corregir mensajes.

Antes de dar por bueno un arreglo del modulo de WhatsApp: comprobar si el camino
pasa por aqui.

## Arrancarlo

```bash
cd tools/puente-wa
npm install          # solo la primera vez

# El webhook DEBE apuntar al puerto donde corre tu backend.
CRM_WEBHOOK=http://127.0.0.1:3001/api/whatsapp/webhook node puente.mjs
```

Escucha en `:8099`. En `backend/.env`:

```
EVOLUTION_URL=http://127.0.0.1:8099
```

| Variable | Por defecto |
|---|---|
| `PUENTE_PUERTO` | `8099` |
| `CRM_WEBHOOK` | `http://127.0.0.1:3056/api/whatsapp/webhook` |

Ojo con `CRM_WEBHOOK`: si apunta a un puerto donde no hay nadie, el enlace
funciona y los mensajes **no entran nunca**, sin un solo error en el CRM.

## Las sesiones

Se guardan en `sesiones/<instancia>/` y **no van al repo**: son las credenciales
del WhatsApp de una persona. Borrar esa carpeta desvincula el numero.

`node desvincular.mjs <instancia>` para cerrar una sesion en condiciones.

## Las etiquetas (#128, #138)

Sirve `/label/findLabels/<instancia>` y `/label/handleLabel/<instancia>`, y emite
`labels.edit` y `labels.association` — lo mismo que Evolution y con la misma
forma, que es la regla de arriba.

Dos cosas que conviene saber antes de perseguir un fallo aquí:

- **Las etiquetas son de WhatsApp Business.** Con una cuenta personal no hay
  ninguna, `findLabels` devuelve `[]` y el CRM no pinta el botón. Eso no es una
  avería: es lo mismo que pasa en producción.
- **Se guardan en memoria**, no en disco. Al reconectar, WhatsApp las vuelve a
  mandar en la sincronización del estado y se repueblan solas.

## El historial va como `messages.set`

Al enlazar eligiendo «el último mes» o «todo», las tandas se mandan al CRM como
**`messages.set`** con un array, igual que hace Evolution — no como mensajes
sueltos.

Iba mensaje a mensaje, y esa diferencia escondió el fallo del **#73** durante
semanas: en local el historial entraba y en producción no, porque el CRM ni
pedía ni atendía ese evento. Si esto se vuelve a cambiar, se vuelve a probar una
cosa y a desplegar otra.
