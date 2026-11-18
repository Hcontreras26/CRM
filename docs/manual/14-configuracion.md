# Configuración

No está en el menú lateral: se entra desde tu nombre, abajo del menú, ›
**Configuración del CRM** (sale a admin, superadmin y project manager). Atajo
**G** y después **S**.

**Configuración** — *Ajustes del sistema y gestión de usuarios.* A la izquierda,
sus pestañas: **Proyectos**, **Usuarios**, **Disponibilidad**, **Roles y
Permisos**, **Campos custom**, **Árbol de categorías**, **Canales**, **Proceso
comercial**, **Formularios**, **Webhooks**, **Email seguimiento**, **Plantillas
email**, **Atajos rápidos**, **Numeración docs**, **APIs globales** y
**Seguridad**. Las que llevan una flecha abren otra pantalla del CRM.

## Para qué sirve

Es la trastienda: quién entra y con qué permisos, cómo se llama y se comporta
cada campus, y las piezas compartidas (campos, plantillas, numeración). **La
configuración no es de las gestoras**: si algo debería cambiar, se pide en
**Solicitudes de cambio**.

---

## 1. Usuarios

**Gestión de usuarios** — *Quién entra al CRM, con qué rol y en qué proyectos.*
Se filtra por **Cualquier rol**, **Cualquier estado** (**Activos**, **Nunca han
entrado**, **Desactivados**) y proyecto.

### Dar de alta a alguien

1. **Crear usuario**.
2. Nombre, correo y **rol**. Cada rol lleva su explicación:
   - **Admin** — acceso operativo completo.
   - **Gestor** — solo sus proyectos y sus prospectos. Entra en el reparto.
   - **Desarrollador / Soporte** — ve todos los proyectos. Para soporte técnico.
   - **Tutor / Profesor** — colaborador externo: solo sus formaciones y sus
     comisiones.
   - **Colaborador** — solo ve su tablero de Tareas.
   - **Tutor redactor** — su tablero, su factura del mes, sus consultas y sus
     cursos.
3. Si hace falta, roles de más (por ejemplo, gestor y tutor).
4. Sus **proyectos**, y en cada uno si **recibe prospectos**. A una admin se le
   puede dar una empresa entera (solo el superadmin).
5. Guarda. Le llega un correo de bienvenida. **Si el envío por email no está
   activo, copia este link y pásaselo. Caduca en 24h.**

### Otras acciones

En el menú de cada usuario: **Editar usuario**, **Ausencias**, **Desactivar** y
**Reactivar**.

- **Desactivar**: **No podrá entrar y se le cerrará la sesión al momento.** Sus
  prospectos se reparten entre el resto.
- **Equipo comercial a su cargo** (en la ficha de una admin): si marcas gestoras,
  esa persona verá solo lo suyo y lo de ellas. Sin equipo, vuelve a ver todo lo
  de sus campus. Lo decide el superadmin.
- **Permisos** de la persona: su **Rol a medida** (o **Ninguno: lo de su rol**) y
  los permisos sueltos que se le dan o se le quitan (**Excepción suya**). No
  puedes dar lo que tú no tienes.
- Cambiar el correo de alguien (solo el superadmin): con el correo viejo ya no
  podrá entrar. Si la persona recibe prospectos por Make, hay que cambiar también
  su correo en Make.

## 2. Disponibilidad y ausencias

**Disponibilidad para el reparto.** Quien esté marcado **No disponible** o tenga
una **ausencia activa hoy** se salta al asignar prospectos nuevos. El reparto
sigue con el resto.

- Pestaña **Disponibilidad**: cambia cada persona entre **Disponible** y **No
  disponible**.
- **Ausencias** (desde el menú del usuario): **Ausencias programadas** con
  **Desde**, **Hasta** y **Motivo** › **Añadir**. Las activas hoy salen **ACTIVO
  HOY**.

Si la persona no entra en el reparto por su rol, sale: **Este rol no entra en el
reparto de prospectos, así que marcarlo ausente no cambia a quién le llegan.
Sirve como registro.**

## 3. Roles y Permisos

**Roles fijos** (los del sistema) y **Roles a medida**.

- En cada rol, la lista de permisos agrupados como el menú. Busca con **Buscar
  un permiso: «facturas», «borrar», «WhatsApp»…**. Los que dependen de otro
  avisan: **Hay permisos que necesitan otro** › **Marcarlo**.
- **Nuevo rol a medida**: **Parte de un rol fijo y luego cambias solo lo que lo
  hace distinto.** › **Crear**.
- La pestaña de **vista** de un rol a medida: **Donde entra**, **Que no ve en el
  menu**, **Bloques del dashboard** y **Menu estrecho al entrar**. Los roles del
  sistema traen su vista de fábrica.
- Al guardar: **Permisos guardados — Queda apuntado en el registro de
  cambios.**

La lista completa de permisos, qué deja hacer cada uno y qué rol lo trae de
serie está en `docs/PERMISOS.md`.

## 4. Proyectos (campus)

**Proyectos** — *Campus y empresas del CRM.* **Configurar** abre los ajustes de
un campus, con pestañas:

| Pestaña | Qué se cambia |
|---|---|
| **General** | Nombre, color, logo, **Proyecto activo** (desactivar lo oculta del selector). |
| **Modulos** | Qué secciones del CRM tiene ese campus. Presets: **CRM Formacion**, **Plataforma IA**, **Minimal**. Al guardar, **Recarga el navegador para ver el nuevo sidebar**. |
| **Categorias** | Categorías de productos. |
| **Campos** | Los campos del formulario de prospecto. |
| **Columnas** | Qué columnas salen en las listas. |
| **Países** | Prefijos de subdominio por país, para separar prospectos por país. |
| **Paneles externos** | Enlaces que salen en el menú (con **Pestaña nueva** para los sitios que no se dejan incrustar). |
| **Webhook** | La dirección y la clave del webhook de captura del campus. **Regenerar** cambia la clave. |
| **APIs** | Credenciales propias del campus, cifradas. **Test** las prueba. |
| **Etiquetas sidebar** | Cambiar el nombre de las entradas del menú para ese campus (solo superadmin). |
| **Stripe** | Monitor de suscripciones (proyectos IA). |

**Nuevo proyecto** crea un campus: **Nombre**, **Slug**, **Tipo**, **Alerta
inactividad (dias)** y **Sociedad emisora (facturación)** (la empresa que emite
sus facturas y su numeración).

## 5. Lo demás

| Pestaña | Qué es |
|---|---|
| **Campos custom** | Campos de más para prospectos, clientes o productos. **Nuevo campo**: tipo (**Texto**, **Número**, **Fecha**, **Lista (opciones)**, **Sí/No**, **Texto largo**), **Etiqueta visible** y **Campo requerido**. |
| **Árbol de categorías** | Ver [06-catalogo.md](06-catalogo.md). |
| **Canales** | Pendiente de terminar: la pantalla dice **Backend pendiente**. |
| **Proceso comercial** | Ver [02-prospectos.md](02-prospectos.md). |
| **Formularios**, **Webhooks**, **Email seguimiento** | Ver [09-captacion.md](09-captacion.md). |
| **Plantillas email** | Las plantillas de correo de cada campus. **Nueva plantilla**, **Preview**, **Editar**, **Eliminar**. Las **De la casa** vienen con el CRM. Se usan desde la ficha de cada prospecto. |
| **Atajos rápidos** | Los atajos del botón flotante de cada campus y a quién se le enseñan (**Visible para:**). Se aplican al cambiar de campus o al recargar. |
| **Numeración docs** | El **Próximo número** de los documentos de cada campus. Ojo: si lo retrocedes y ya existe un documento con ese número, el siguiente fallará. |
| **APIs globales** | Credenciales que valen para todo el CRM. **Configurar** y **Test**. |
| **Seguridad** | Resumen de cómo se protegen las contraseñas, las sesiones y las claves. Solo informa. |

---

## Permisos

| Acción | Admin | Superadmin | Soporte | Project manager |
|---|---|---|---|---|
| Ver usuarios | Sí | Sí | Sí | Sí |
| Crear, editar, desactivar usuarios | Sí | Sí | Sí | No |
| Permisos sueltos y rol a medida de una persona | Sí | Sí | No | No |
| Contraseña de otra persona | A tutores de sus campus | Sí | No | No |
| Empresas enteras y cambiar correos | No | Sí | No | No |
| Equipo de una admin | No | Sí | No | No |
| Ver y cambiar roles | Sí | Sí | No | Ver |
| Crear campus | No | Sí | Sí (ver [descuadres.md](descuadres.md)) | No |
| Configurar un campus (datos, clave del webhook) | No | Sí | Sí | No |
| Logo y atajos de un campus | Sí | Sí | Sí | No |
| Campos custom, canales | Sí | Sí | Sí | Ver |
| Encender y apagar módulos | No | Sí | Sí | No |
| Plantillas de correo | Sí | Sí | Sí | Ver |
| Numeración de documentos | Sí | Sí | Sí | No |

## Errores frecuentes

| Lo que ves | Qué pasa y qué hacer |
|---|---|
| **Esta pantalla es para administradores** | Tu rol no gestiona usuarios. |
| **No se pudo saber qué roles puedes dar** | No se ha cargado tu lista de permisos. Recarga. |
| El usuario sale **Nunca ha entrado** | Puede que no le llegara el correo de alta. Cópiale el enlace de invitación. |
| **Acceso restringido** en Atajos o Numeración | Solo administración y superadmin. |
| **Solo superadmin puede modificar las etiquetas del sidebar.** | Pídeselo al superadmin. |
| **Color inválido** | Usa el formato #rrggbb. |

## Guion del vídeo (4 minutos)

1. **(0:00–0:20)** «Configuración es la trastienda. Solo administración.»
2. **(0:20–1:20) Usuarios.** **Crear usuario** de prueba como **Gestor**, con un
   campus y **recibe prospectos**. Copiar el enlace de invitación. **Desactivar**
   y leer el aviso.
3. **(1:20–1:50) Disponibilidad.** Marcar **No disponible** y añadir una ausencia
   para mañana.
4. **(1:50–2:40) Roles y Permisos.** Buscar «facturas» en un rol, **Nuevo rol a
   medida** partiendo de Gestor, y dar un permiso suelto a una persona.
5. **(2:40–3:30) Un campus.** **Configurar**: **General**, **Modulos** y
   **Webhook**.
6. **(3:30–4:00)** **Plantillas email** y **Atajos rápidos**, para enseñar dónde
   están.
