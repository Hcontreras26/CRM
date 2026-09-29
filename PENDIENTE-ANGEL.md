# Dónde nos quedamos · rama `feat/angel`

> 08/09/2026 · Para retomar sin releer el hilo.

---

## Lo primero al volver

**Todo subido.** 18 commits en `feat/angel` (`aed0303..0431845`).
Backend 864/864, frontend 625/625, tipos limpios. **Ninguna prueba en rojo.**

Comentado a Diego en el **#126**, **#111** y **#132**.

---

## Lo que está a medio hacer ahora mismo

**Nada.** Lo de esta tanda está terminado, probado y subido.

---

## Lo que hay que decirle a Diego

### 1 · El panel de Informes declara ingresos de más

**Sigue igual que el 26 de agosto.** Es lo que más pesa de este documento.

El #29 dice que lo cobrado sale de `conversion_payments` y **nunca** de
`conversions.importe_pagado`. `report.model.js` usa ese campo en **cinco**
sitios. Medido hoy en la base de desarrollo:

| | |
|---|---|
| Lo que dice el panel | 10.940 € |
| Lo que hay en `conversion_payments` | 3.700 € |
| **De más** | **7.240 € (66 %)** |

El reporte semanal ya manda el número real y lo dice al pie. El panel sigue
mal, y es decisión de Diego. Está dicho en el comentario del #126.

### 2 · Dos migraciones sin aplicar

| | | Sin ella |
|---|---|---|
| **144** | `registro_tareas` | El registro funciona igual: «Tareas» sale tachada en los filtros y la pantalla lo dice |
| **145** | `gasto_de_ia` | No hay tope de gasto, y el aviso lo nombra para que se sepa cuál falta |

Las de antes —**127** (`registro_de_correos`) y **132** (`avisos_por_correo`)—
**ya están aplicadas**. Ojo con los números: la 142 y la 143 se las quedó Diego
(#86 y #87, ya en producción), y por eso las mías se movieron a 144 y 145.

**La 146 ya no existe.** Escribí una tabla para apagar avisos sin ver que
`avisos_apagados` ya hacía eso desde la 132. Al usar la que hay, esa parte
funciona sin migración.

### 3 · Una pregunta abierta

Ninguna. La de `projectIds` se resolvió mirando `projectAccess`: superadmin y
soporte pasan sin proyectos, admin y gestor no. El mínimo va donde el alta
quedaría rota.

---

## Lo que se hizo en esta tanda

**#111 · Notificaciones** — agrupadas («×98» contado en SQL, no en la
pantalla), «para hacer» separado de «para saber», apagado por tipo y por
persona, y los enlaces arreglados.

**#132 · El correo con enlaces** — el filtro rápido subió al servidor (se
aplicaba sobre la página de 20) y el «plan de mañana» ya lleva enlaces que
abren el CRM filtrado y en el proyecto correcto.

**#126 · Proceso de ventas** — los tres avisos verificados de punta a punta
contra la base y la API, no leyendo el código.

### Cuatro fallos reales que aparecieron por el camino

1. **El webhook devolvía 500 al reenviar el mismo formulario.**
   `canalDetectado` se usaba en la línea 216 y se declaraba en la 234. Zona
   muerta temporal, desde el 9 de junio. No se veía porque la nota sí se
   guardaba: solo fallaba la respuesta HTTP.

2. **Dos sistemas para apagar avisos.** El mío borraba las preferencias de
   correo de la gente al guardar, sin decirlo.

3. **Enlaces muertos.** `/prospectos/papelera` no existe y abría una ficha con
   ese id; y «nuevos prospectos» buscaba `status: 'nuevo'` cuando desde la
   migración 076 nacen `'por_contactar'`.

4. **`CLAUDE.md` mandaba leer ocho documentos que nunca existieron.**
   Corregido: ahora lista los trece que hay de verdad.

---

## Lo que queda abierto

**#132** — la validación mensual: «toda tu base por correo, para que la
validen». Mismo aparato, otra cadencia, **ya sin bloqueo**. Con la salvedad del
ticket: tiene que poder responderse, o sea una pantalla donde ir marcando.

**#111 y #132** — falta verlos en `/testeo` y portarlos a ISEIE. **Eso lo lleva
Diego**, no nosotros.

**16 issues sin empezar** — WhatsApp (#128, #129, #112, #101, #99, #67, #63),
paneles (#130), IA (#44, #30), manual (#66), y #2 y #11.

---

## Cómo se levanta esto

```bash
docker compose -f docker-compose.dev.yml up -d
cd backend  && npm run dev     # :3001
cd frontend && npm run dev     # :5173/crm
```

Entrar con `manuel@empresa.com`. La base local es desechable; si le faltan
migraciones, se aplican con `psql` desde `backend/migrations/` en orden.

**Aviso:** el `.env` local tiene `BREVO_API_KEY=test`, que no es una clave. Los
correos no salen de esta máquina: quedan en `email_envios` con estado
`bloqueado`, que es lo que hace el freno de pruebas. Para que salgan de verdad
hace falta una clave real y `EMAIL_LISTA_BLANCA` con las direcciones
autorizadas.
