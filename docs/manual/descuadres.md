# Descuadres entre pantalla y servidor

Lo que se ha encontrado al escribir el manual (#66) leyendo el código de
`staging` el 17/11/2026. No se ha tocado nada: cada punto es para decidir si se
arregla la pantalla, el catálogo de permisos o el texto.

**La regla de partida.** Desde #423 el servidor decide por **permiso** (el mapa
de cada persona, con su rol, su rol a medida y sus excepciones). El menú también
(`canSeeItem` y `rutaPermitida` en `Sidebar.jsx`). Pero muchas pantallas siguen
preguntando por el **rol principal** (`user.role === 'admin'`). Eso tiene tres
efectos que se repiten abajo:

1. **Soporte** trae de serie permisos de edición que la pantalla le esconde
   porque no es `admin`.
2. **Quien recibe un permiso suelto** (una gestora con `leads.assign`, un
   project manager con lo que sea) no ve el botón, aunque el servidor le diría
   que sí.
3. **A un admin al que se le quita un permiso** le sigue saliendo el botón, y el
   servidor le contesta 403.

Y además se ignoran los **roles de más** (`roles_extra`): quien es gestora como
segundo rol no aparece en las listas que filtran por `role === 'gestor'`.

Ruta de los ficheros: `frontend/src/` salvo que se diga otra cosa.

---

## 1. Botones que miran el rol y no el permiso

| # | Dónde | Lo que hace la pantalla | Lo que dice el servidor | Efecto |
|---|---|---|---|---|
| 1 | `modules/leads/components/lead-detail/LeadSidebar.tsx:76` y `LeadHeaderCard.tsx` | **Fusionar duplicado** solo si `isAdmin` (admin/superadmin) y `leads.edit`. | `POST /api/leads/:id/merge` pide `leads.edit`, que la gestora trae de serie (el catálogo dice «fusionar fichas»). | La gestora puede fusionar por el servidor, pero no tiene el botón. Decidir si la gestora fusiona o se le quita del permiso. |
| 2 | `LeadHeaderCard.tsx:94`, `LeadSidebar.tsx:68`, `LeadsFiltersBar.tsx:221` | **Reasignar** y el reparto de los sin responsable solo a `isAdmin`. | `leads.assign`: Admin y Soporte. | Soporte no ve **Reasignar**; una gestora a la que se le da `leads.assign` tampoco. |
| 3 | `modules/leads/pages/LeadsPage.tsx:154-155` | Borrar cualquiera: rol admin/superadmin + `leads.delete`. | `leads.delete` y `leads.delete_cualquiera`: Admin y Soporte. | Soporte solo puede borrar sus propios prospectos desde la lista. |
| 4 | `modules/leads/components/QuickActions.tsx:179,188` | Textos «Reportar como spam (revisa superadmin)» y «Eliminar (superadmin)». | Borrar lo puede el admin; los avisos de spam los revisa quien tiene `leads.spam` (Soporte de serie). | El texto dice que borrar es de superadmin y no lo es. |
| 5 | `modules/leads/components/SpamReportDialog.tsx:29,67` | «Un superadmin revisa los reportes». | Igual que el 4. | Texto. |
| 6 | `modules/notificaciones/components/SpamReportsSection.tsx:49,52` y `LeadsPage.tsx:1104` | La sección **Reportes de spam pendientes** y la marca de spam pendiente solo a `role === 'superadmin'`. | `GET /api/leads/spam-reports` pide `leads.spam`, que trae Soporte. | Soporte tiene el permiso de revisar spam y no tiene dónde hacerlo. |
| 7 | `modules/accounting/pages/StripePaymentsPage.tsx:67` | Asociar pagos: rol admin/superadmin + `stripe.edit`. | `stripe.edit`: Admin y Soporte. | Soporte no puede asociar pagos de Stripe. |
| 8 | `modules/clients/pages/ClientDetailPage.tsx:297` | **Eliminar** cliente: solo `role === 'superadmin'` + `clients.delete`. | `clients.delete` de serie: Admin. | El admin tiene el permiso y no el botón. |
| 9 | `modules/commissions/pages/CommissionsPage.tsx:203` | **Reglas (% por gestor)**: rol admin **y** superadmin + `commissions.reglas`. | `commissions.reglas` de serie: Soporte. | Solo el superadmin lo ve; Soporte, que es quien lo trae, no. La condición `isAdmin && role === 'superadmin'` es redundante. |
| 10 | `modules/convocatorias/pages/ConvocatoriasPage.tsx:51,252` | **Nueva** convocatoria: rol admin/superadmin + `convocatorias.create`. | `convocatorias.create`: Admin y Soporte. | Soporte no puede crear. |
| 11 | `modules/whatsapp/pages/PlantillasPage.tsx:80` | Editar plantillas compartidas: rol admin/superadmin + `whatsapp.plantillas_compartidas`. | El permiso: Admin y Soporte. | Soporte no puede. |
| 12 | `modules/email-templates/pages/EmailTemplatesPage.tsx:24,93,149` | Crear y editar plantillas de correo: rol admin/superadmin + permiso. | `email_templates.create/edit`: Admin y Soporte. | Soporte no puede. |
| 13 | `modules/documents/pages/DocumentsConfigPage.tsx:60` y `modules/settings/pages/ShortcutsConfigPage.tsx:65` | Numeración y atajos: rol admin/superadmin + permiso. | `documents.numeracion`, `projects.personalizar`: Admin y Soporte. | Soporte ve **Acceso restringido**. |
| 14 | `modules/settings/components/settings/ProjectsTab.tsx:22` | **Nuevo proyecto**: solo `role === 'superadmin'` + `projects.create`. | `projects.create` de serie: Soporte. | Quien trae el permiso no tiene el botón. |
| 15 | `modules/matriculas/pages/MatriculasPage.tsx:473` | **Validar datos / Validar matrícula / Rechazar** a quien tiene rol superadmin o admin, sin mirar el permiso. | `POST /api/matriculas/:id/estado` pide `matriculas.cambiar_estado` (Admin y Soporte). | Soporte no tiene los botones; un admin al que se le quite el permiso los ve y recibe 403. |
| 16 | `MatriculasPage.tsx:101-102` | Pestañas **Certificaciones** y **Webhooks de admisión** solo a rol admin/superadmin (+ `diplomas.view_emisiones`); consultas de Certifex a admin/superadmin/soporte. | `diplomas.view_emisiones` y `certifex_consultas.view` los trae también el Project manager. | El project manager tiene los permisos y no las pestañas. |
| 17 | `modules/certifex/pages/CertifexDiplomasPage.tsx:562-564` | Rechazar, corregir y revocar se enseñan a quien «administra» (rol admin + `diplomas.view_emisiones`), no por `diplomas.aprobar`, `diplomas.edit`, `diplomas.revocar` ni `diplomas.avisar`. | Cada acción pide su permiso. | A un admin al que se le quite, por ejemplo, `diplomas.revocar` le sale **Revocar** y recibe 403. |
| 18 | `modules/moodle/pages/MoodlePage.tsx:26`, `MoodleCampusPage.tsx:97` | **Conectar** Moodle: `role === 'superadmin'`. | `moodle.conectar` (solo superadmin de serie, pero se puede dar). | Si se le da a alguien, no lo ve. |
| 19 | `modules/proceso/pages/ColaDelDiaPage.tsx:90`, `SeguimientoPage.tsx:92` | La vista de equipo (**La cola del equipo**, filtrar por gestora) solo a rol admin/superadmin. | `proceso.view` lo trae el project manager y soporte; Diego (04/11): «el project manager ve todo». | El project manager y soporte ven **Tu día**, que estará vacío porque no tienen prospectos. |
| 20 | `modules/consultas/pages/ConsultasPage.tsx:70` | Vista de administración de Consultas: superadmin, soporte o admin + `consultas.view`. | `consultas.view` lo trae el Project manager. | El project manager tiene el permiso y no la vista de administración (ni **Solo sin tutor**). |
| 21 | `modules/reports/components/DondePonerElDinero.tsx:78` | **¿Dónde ponemos el dinero?** solo a rol admin/superadmin. | `reports.dinero`: Admin y Project manager. | El project manager no lo ve. |
| 22 | `modules/reports/components/TasaDeCierre.tsx:39` | Cambiar el baremo: rol admin/superadmin, sin mirar `reports.editar_baremo`. | Pide el permiso. | Un admin sin el permiso ve el botón y recibe 403. |
| 23 | `modules/reports/components/ActividadPorComercial.tsx:305` | «Ve todo» por rol admin/superadmin. | El recorte lo hace el servidor. | Soporte y project manager ven la vista de gestora. |
| 24 | `modules/tutores/pages/TutoresPage.tsx:104`, `ComisionesTutoresPage.tsx:71` | Contraseña de tutor y liquidar comisiones: rol admin/superadmin + permiso. | `tutores.contrasena`, `tutores.liquidar`. | Si se le dan a la gestora de colaboraciones, no los ve. |
| 25 | `shared/components/layout/Sidebar.jsx:1552` | **Configuración del CRM** (menú de usuario) solo a rol principal admin/superadmin o a project manager. | Soporte trae `users.create`, `projects.create`, `installation.edit`… | Soporte no tiene el enlace (tiene que escribir la dirección). |

## 2. Listas que filtran por el rol principal

Quien tiene el rol como **segundo rol** no aparece.

| Dónde | Qué lista |
|---|---|
| `modules/leads/components/lead-detail/LeadReassignDialog.tsx:64` | Gestoras a las que reasignar. |
| `modules/leads/components/lead-detail/LeadProductsCard.tsx:61` | Gestor de cada programa de interés. |
| `modules/matriculas/components/MatriculaDetail.tsx:230` | Gestora de la matrícula. |
| `modules/commissions/components/RulesDialog.tsx:49` | Gestores de las reglas de comisión. |
| `modules/users/components/AvailabilityDialog.tsx:131` | Si la persona entra en el reparto (dice «Este rol no entra en el reparto» a quien es gestora como segundo rol). |
| `modules/leads/pages/LeadDetailPage.tsx:99` | Solo carga gestoras si el rol principal es admin/superadmin. |

## 3. El menú esconde lo que la dirección abre

`rutaPermitida` (`Sidebar.jsx:561`) deja abrir una pantalla por su dirección
con **solo el permiso** («nunca el rol»), pero `canSeeItem` además exige que el
rol esté en `roles` de la entrada. Resultado: hay pantallas que no salen en el
menú y se abren escribiendo la dirección.

| Entrada (`Sidebar.jsx`) | `roles` del menú | Quién trae el permiso de serie |
|---|---|---|
| Captación › Email (223) | superadmin, admin | `email_sequences.view`: también Gestora |
| Captación › Formularios (224) | superadmin, admin | `forms.view`: también Gestora |
| Captación › Widget web (227) | superadmin, admin, soporte | `widget.view` y `widget.edit`: también Gestora |
| Catálogo › Productos (252) | superadmin, admin | `products.view`: también Gestora |
| Finanzas › Pendientes de facturar (321) | superadmin, admin | `facturas.view`: también Gestora |
| Finanzas › Pagos Stripe (322) | superadmin, admin | `stripe.view`: también Gestora |
| Análisis › Feedback (340) | superadmin, admin | `feedback.view`: también Gestora |

Y al revés, entradas que nombran un rol que no trae el permiso:

| Entrada | Problema |
|---|---|
| Catálogo › Cursos pendientes (253) | `roles` incluye `tutor`, pero pide `products.view`, que el tutor no trae. El servidor (`/api/cursos-pendientes`) responde «lo de cada uno». **Ninguna tutora ve la entrada**, y escribiendo la dirección sale «No tienes acceso». |
| Sistema › Novedades (403) | `novedades.view` lo trae el Tutor, pero el tutor solo ve entradas cuyo `roles` lo nombre, y esta no. |
| Sistema › Mensajes (404) | `mensajes.usar` lo trae el Tutor; la entrada no tiene `roles`, así que a quien es solo tutor no le sale. Igual con Notificaciones, Soporte y Manual. |
| Finanzas › Facturación (328) | Pide `facturas.emitir` (Admin de serie). Gestora, soporte y project manager traen `facturas.view`, `create`, `completar`… y no tienen entrada. **Soporte trae `facturas.configurar`** y no puede llegar a **Facturación › Configuración** por el menú. |

`/configuracion` no está en el menú, así que `rutaPermitida` la deja abrir a
cualquiera: una gestora que pulse **G** y **S** entra en Configuración y ve todas
las pestañas (`modules/settings/pages/SettingsPage.tsx` no filtra ninguna). El
contenido de cada una sí responde 403 o «Esta pantalla es para administradores».

## 4. Pantallas que dicen algo que no es verdad

| Dónde | Lo que dice | Lo que pasa |
|---|---|---|
| `modules/leads/pages/DupReviewQueuePage.tsx:238` | «Si es un error puedes restaurarlo después desde Papelera.» | No hay pantalla de Papelera. Restaurar (`PATCH /api/leads/:id/restore`) solo existe en la API y solo lo trae Soporte. |
| `modules/leads/components/SoftDeleteDialog.tsx` | «Se puede restaurar.» | Lo mismo. |
| `modules/settings/pages/ChannelsConfigPage.tsx:48,54` | «Backend pendiente … El endpoint /api/project-channels aún no existe.» | Existe: `backend/src/modules/project-channels`, registrado en `app.js:328` y en el manifiesto. |
| `shared/hooks/usePermission.ts:28-33` (`FIXED_ROLES`) | Admin: «no gestiona usuarios»; Superadmin: «Solo este rol gestiona usuarios»; Soporte: «solo lectura». | El admin trae `users.create/edit/delete`; soporte trae muchos permisos de edición. |
| `modules/users/lib/usersUi.ts` (`ASSIGNABLE_ROLES`) | Admin: «Acceso operativo completo. No gestiona usuarios.» | Igual que arriba. Es el texto que se ve al crear un usuario. |
| `modules/tasks/lib/recorridoTablero.ts:13` | «Solo lo usan superadmin, admin y colaboradores.» | También tutores y tutores redactores (`ROLES_TAREAS` + `tutor` en el menú). |
| `modules/manual/pages/ManualPage.tsx` | El manual dentro del CRM. | Es la versión antigua (tres roles, pantallas de antes). Este manual la sustituye: decidir si se retira o se enlaza. |

## 5. Lo que el permiso promete y no tiene pantalla

| Permiso | Catálogo | Pantalla |
|---|---|---|
| `matriculas.create` (Gestora, Admin, Soporte) | «Una matrícula nueva.» | No hay botón para crear una matrícula a mano: solo llegan por el webhook de admisión. |
| `leads.restaurar` (Soporte) | «Devolver a la lista un prospecto borrado.» | Sin pantalla (ver Papelera arriba). |
| Rol `project_manager` | Sale en el catálogo, en el menú y en las pruebas de permisos. | No se puede dar desde el CRM: ni el formulario de usuario (`ASSIGNABLE_ROLES`) ni el servidor (`backend/src/modules/users/user.validation.js:33,37`) lo aceptan. Hoy solo se pone a mano en la base. |

## 6. Textos que se contradicen entre pantallas

| Dónde | Qué |
|---|---|
| `modules/conversions/components/PaymentDialog.tsx:126` | Apuntar un cobro se llama **Registrar abono**; en Facturación, **ABONO** es una factura rectificativa. Para una gestora nueva son la misma palabra para dos cosas opuestas. |
| `modules/whatsapp/pages/PlantillasPage.tsx:66-67` | Los grupos se llaman **Día 3 · Última plaza** y **Día 4 · Último recurso**, pero en el proceso comercial la última plaza es el día 4 y la última oportunidad los días 7 y 8. «Día» ahí quiere decir «paso». |
| `modules/proceso/components/AgendaDelProspecto.tsx` | En el mismo bloque: «apuntar el contacto no lo marca solo» y «un contacto con la persona cierra el paso que toca». Las dos son ciertas (la casilla de la ficha y la regla de la cola), pero leídas juntas parecen contradecirse. |
| `shared/components/layout/KeyboardShortcutsModal.jsx:27` | **G A** «Ir a Contabilidad»: en el menú esa pantalla se llama **Finanzas › Dashboard**. |

---

## Dudas para confirmar (vienen del borrador del manual general)

Lo que el código no responde. El manual lo dice de forma general hasta que se
confirme.

1. **Paso 4.** ¿En los campus de este CRM es descuento, beca o depende del
   campus? El manual dice «un descuento o una beca, según el campus».
2. **Reparto por actividad.** ¿Qué campus usan hoy la asignación por actividad
   (#513) y cuáles el turno de siempre?
3. **Quién lleva la facturación en cada empresa**, para poner el puesto en «A
   quién preguntar».
4. **Facturas de la gestora.** Trae `facturas.emitir_borrador` (darle número a
   un borrador) pero no tiene la entrada **Facturación**. ¿Emite ella desde la
   ficha o lo deja siempre a facturación?
5. **Stripe.** ¿Es correcto decir que un pago por Stripe no se apunta a mano
   porque entra solo?
6. **Horas para la nómina.** La gestora trae `payroll.create` («Apuntar horas»)
   pero no tiene la entrada Nóminas. ¿Registran horas?
7. **Borrar ventas.** La gestora trae `conversions.delete`; el manual le dice que
   no borre para corregir. ¿Se le quita el permiso o basta con la norma?
8. **Datos personales (RGPD).** ¿Hay un procedimiento escrito para cuando alguien
   pide borrar sus datos?
9. **Comisiones de las gestoras.** Existe la consulta «mis comisiones», pero no
   hay pantalla para la gestora.
10. **El manual dentro del CRM** (`/manual`): ¿se retira, se enlaza a este o se
    reescribe?
