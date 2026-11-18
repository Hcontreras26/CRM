# Dashboard

Menú: **Principal › Dashboard** · atajo **G** y después **D**.

## Para qué sirve

Es la portada: cómo va el día y el mes, de un vistazo. Lo primero que se ve es
**qué hay que hacer hoy**; después, lo que ya ha pasado. Todo lo que enseña
respeta el campus o la empresa que tengas elegidos arriba, y cada gestora ve
solo lo suyo (el recorte lo hace el servidor).

## Qué hay en la pantalla, de arriba abajo

| Bloque | Qué dice |
|---|---|
| Cabecera **Dashboard** | La fecha de hoy y el campus o la empresa que estás mirando. |
| Aviso de números que faltan | Solo sale si en la serie de facturas falta algún número: **No existen estos números:** con el botón **Emitir la que falta**. Lo ve todo el mundo porque es lo que mira Hacienda. |
| **El equipo este mes** / tu puesto | El ranking del mes por **lo cobrado** (los pagos registrados, por su fecha de cobro). Una gestora ve su puesto (**Vas en cabeza**, o cuánto le falta para el puesto de arriba) y su tasa de cierre. |
| **Lo que toca** | Del proceso comercial: **Para hoy**, **Para mañana** y **Esta semana**. Pulsa un tramo y se abre la cola del día con él puesto. |
| **Ayer y hoy** | Lo que entró y lo que se hizo. Son los mismos números que Reportes. |
| Actividad por comercial | Ayer, quién llamó, escribió y apuntó. Administración ve las primeras y el equipo; una gestora, su línea. |
| **Qué ha pasado hoy** | Altas, ventas, cambios de estado y contactos, de lo más nuevo a lo más viejo. **Ver más** para seguir bajando. |
| **Tu día de hoy** | **Pendientes** (recordatorios de hoy), **Nuevos**, **Inactivos** (prospectos sin actividad), **Cobros vencidos** e **Ingresos hoy**, con la lista de **Seguimientos pendientes**. |
| **Prospectos por estado** y **Prospectos por canal** | Gráficas del reparto actual. |
| **Embudo de conversión** e **Insights** | Cómo avanzan los prospectos por los estados y avisos automáticos (por ejemplo, tasa de conversión baja). |
| Cursos vendidos y **Programas más vendidos** | Lo facturado por formación. |
| **Prospectos recientes** | Los últimos 10, con **Ver todos** para ir a la lista. |

En un proyecto de IA el dashboard enseña **MRR actual**, **Suscripciones
activas**, **Churn rate** y **Cobros fallidos**.

**Ojo con «Cobros vencidos».** Cuenta ventas con saldo pendiente y fecha de pago
ya pasada. «Cuentas por cobrar» (Finanzas) cuenta cuotas e importes: son dos
cifras distintas y no tienen por qué coincidir. Lo dice el propio CRM al pasar
el ratón por encima.

## Tareas habituales

### Empezar el día

1. Entra en el Dashboard.
2. Mira **Lo que toca** y pulsa **Para hoy**: se abre la cola del día con ese
   tramo.
3. Vuelve y mira **Seguimientos pendientes**. Los marcados **VENCIDO** van
   primero.

### Ver un prospecto sin salir del Dashboard

En **Prospectos recientes**, pulsa una fila: se abre la **Ficha rápida** a la
derecha. Para la ficha entera, **Ver ficha completa**.

### Cambiar lo que se ve

Elige otro campus o empresa en el selector de arriba. Si algunos bloques no los
usas, puedes esconderlos en **Sistema › Mis preferencias › Bloques de mi
dashboard** (si los apagas todos, vuelven todos).

## Permisos

| Rol | Qué ve |
|---|---|
| Gestora | Lo suyo: su puesto, sus pendientes, sus prospectos y su actividad. |
| Admin, project manager | Lo de sus campus o su empresa, con el equipo entero. |
| Superadmin, soporte | Todo. |
| Tutor, colaborador, tutor redactor | No entran: el CRM los lleva a Mi campus o a su tablero. |

No hace falta ningún permiso suelto: lo que no te toca no sale.

## Errores frecuentes

| Lo que ves | Qué hacer |
|---|---|
| **No se pudieron cargar los datos** con **Reintentar** | Se ha cortado la conexión con el servidor. Pulsa **Reintentar**; si sigue, abre un ticket. |
| Todo a cero con una empresa elegida | Comprueba que esa empresa tiene campus asignados para ti. Prueba con un campus concreto. |
| **Sin prospectos registrados** | Ese campus aún no tiene prospectos. Aparecerán cuando alguien rellene un formulario o llegue por webhook. |
| Las cifras no coinciden con Cuentas por cobrar | Es normal: miden cosas distintas (ver el aviso de arriba). |

## Guion del vídeo (3 minutos)

1. **(0:00–0:20)** «El Dashboard es lo primero que ves al entrar. Arriba, lo que
   hay que hacer hoy; abajo, lo que ya ha pasado.»
2. **(0:20–0:50)** Enseñar el selector de campus y cómo cambian las cifras al
   pasar de un campus a una empresa.
3. **(0:50–1:30)** **Lo que toca**: pulsar **Para hoy** y ver cómo se abre la
   cola del día filtrada. Volver.
4. **(1:30–2:00)** El ranking del mes: explicar que se mide por lo cobrado, no
   por lo vendido.
5. **(2:00–2:30)** **Tu día de hoy** y **Seguimientos pendientes**; abrir uno en
   la ficha rápida.
6. **(2:30–2:50)** Pasar el ratón por **Cobros vencidos** y leer el aviso de que
   no es lo mismo que Cuentas por cobrar.
7. **(2:50–3:00)** «Si un bloque no lo usas, escóndelo en Mis preferencias.»
