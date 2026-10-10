# Documentación CRM — doc único

> **Fuente de verdad del esquema:** `backend/migrations/*.sql` — todos los SQL ejecutados, en orden.
> Este es el **único** documento de referencia; el resto se consolidó aquí (el historial completo queda en git).

## Deploy y ramas (al día el 09/10/2026)

**Ramas.** `main` = **producción**, con la etiqueta de cada versión (`v2.0.0`, `v2.0.1`). `staging` = **pruebas** (/testeo), independiente de `main`. Lo nuevo entra por `staging`; cuando Diego lo aprueba pasa a `main` con un **pull request** (`gh pr create` + `gh pr merge --admin`: la protección de `main` pide revisión y no se aplica a administradores). El gancho `pre-push` no deja empujar a `main` ni a `feat/angel|fabian|diego`. Las ramas de trabajo salen de `staging`.

| | Producción | Pruebas |
|---|---|---|
| Web | https://360crm.tech/crm | https://360crm.tech/testeo |
| Rama | `main` | `staging` |
| Backend | `/opt/crm/production` · PM2 `crm-api-production` :3001 | `/opt/crm/staging` · PM2 `crm-api-staging` :3002 |
| Frontal | `/var/www/crm/production/frontend` · `npm run build` | `/var/www/crm/staging/frontend` · `npm run build -- --mode staging` |
| Base | `crm_prod_db` | `crm_test_db` |

VPS `187.124.128.126`. PM2 corre como el usuario **claude** (`export PATH=~/.nvm/versions/node/v24.14.1/bin:$PATH; pm2 …`), no como root.

**Subir el backend.** El código sale de la rama (`git archive <rama> backend/src …`), nunca de ficheros sueltos copiados a mano: así se perdió una vez una función. Antes de reiniciar se carga la app entera sin escuchar (`NODE_ENV=test node --env-file=.env -e "import('./src/app.js')"`); `node --check` no basta. Luego `pm2 restart` y `/api/health`.
**Subir el frontal.** Comprobar en `dist/index.html` que las rutas son las del entorno (`/crm/` o `/testeo/`): un build del otro entorno deja la web en blanco con un 200. Se guarda copia de la carpeta anterior.
**Migraciones.** Como `postgres` (`sudo -u postgres psql -v ON_ERROR_STOP=1`), con su bloque de GRANT a `crm_user`, y comprobando el catálogo después (un aviso sin «ERROR» ha dado por aplicada alguna que no lo estaba). Si la columna es un ENUM, hay que ampliar el tipo, no solo el CHECK. **Después de cada tanda, `scripts/dar-propiedad-a-crm-user.sql`** sobre la misma base (#71): lo que crea `postgres` nace suyo, y así las bases de pruebas y de producción dejan de separarse. Es idempotente; el destino es el dueño de la base.
**Copias.** Antes de una subida grande: `pg_dump -Fc`, tar del backend y del frontal en `/var/backups/crm/`.

**Interruptores del `.env` de producción** (09/10): `NOVEDADES_AUTO=0` desde la 2.1.0 (las Novedades se mandan a mano, primero la prueba a Diego; con `1` saldrían solas al arrancar) · `MCP_CODIGO_OBLIGATORIO=true` (Claude pide el código de verificación) · `FEEDBACK_DIA7_INICIO=2026-09-29` (el correo del 7.º día solo para primeros contactos desde ese día) · `PASO_VENCIDO_DISABLED=1` (el trabajo de las 3:00 apagado) · correos del equipo encendidos (sin `RESUMEN_DISABLED` ni `REPORTE_SEMANAL_DISABLED`) · `LEAD_SIN_TOCAR_DISABLED=1`. En pruebas, `EMAIL_LISTA_BLANCA` frena los correos a todo el que no esté en la lista.

**Correos del tablero de tareas** (#210): `TAREAS_CORREOS_ACTIVOS`, **apagado por defecto**. Apagado, el CRM arma cada correo (asignada, devuelta, aprobada, comentario nuevo y el de cada mañana) y lo registra en el log con su destinatario y asunto, pero no llama a Brevo: no sale nada ni en local ni en /testeo. Lo enciende Diego en producción cuando lo decida (`true` o `1`). Cada persona puede apagar cada uno en «Mis preferencias». El de cada mañana va a `TAREAS_DIARIO_HORA` (8 por defecto) en la hora de la oficina (`APP_TIMEZONE`, Europe/Madrid), no en la del servidor; `TAREAS_DIARIO_DISABLED=1` ni lo programa.

**El tablero de tareas, solo en pruebas** (#210, Diego 07/10): igual que la pantalla se esconde en /crm con `SOLO_EN_PRUEBAS`, el servidor no monta `/api/tasks` ni programa el correo de cada mañana en producción. Con `NODE_ENV=production` solo se montan si `CRM_BASE_URL` apunta a `/testeo` —**el servidor de /testeo tiene que tenerla así**, o su tablero dejaría de responder— o si se aprueba con `TAREAS_EN_PRODUCCION=1` (`backend/src/shared/config/soloEnPruebas.js`).
**Frontal:** `VITE_BETA_MODE=true` en producción (lo que no está en `BETA_ROUTES` sale como «Próximamente»); `VITE_FACTURACION_V2` solo en pruebas (la emisión automática de facturas no va a producción).
**Paridad:** ISEIE (https://crm.iseie.com, repo `CRM-ISEIE`) tiene las mismas funciones; los módulos se copian, la navegación no (ISEIE usa `/leads` donde aquí es `/prospectos`). Las personas de fuera (Diana, Hugo) trabajan solo aquí; el paso a ISEIE lo hace el equipo de Diego.
**nginx** (#193, 07/10): el registro de accesos tapa la llave del MCP (`crm_mcp_***`) con el formato `crm_seguro` (`/etc/nginx/conf.d/crm-registro-seguro.conf`). Las copias del sitio van a la carpeta de copias, **nunca** dentro de `sites-enabled`: nginx carga todo lo que hay ahí.

**Versiones y arreglos urgentes** (09/10). `v2.1.0` en producción desde el 07/10 (etiqueta en `main`). Un arreglo que tiene que llegar a producción sin esperar a la versión siguiente va **solo**: rama `hotfix/<nombre>` sacada de `origin/main`, `git cherry-pick -x` del commit que ya entró en `staging`, pull request a `main` y despliegue desde `main`. Así no se arrastra lo que está en pruebas (el 08 y el 09/10: el ranking por lo cobrado, la paginación de Facturas de ISEIE y la checklist manual). `staging` siempre lleva todo lo de `main` y algo más; nunca al revés.
**Comprobar qué corre de verdad un servidor:** el md5 de cada `.js` de `backend/src` (quitando los `\r`) contra el de la rama. El 09/10 los cuatro entornos daban 0 ficheros distintos.

**Lo que no está aprobado para producción** va detrás de `SOLO_EN_PRUEBAS` en el frontal (verdadero en local y en el entorno de pruebas, falso en producción): no sale ni en el menú ni por la dirección. El 09/10: Tareas (#210), Convocatorias y Certificaciones (Certifex). Para aprobar una pantalla, se quita de detrás de la bandera.

**Checklist del proceso comercial** (09/10). Es **manual**: un paso solo sale hecho si la gestora lo marca (guarda quién y cuándo). Si ya hay un contacto apuntado que lo daría, lleva la marca «contactado», pero sigue por hacer. «+ Seguimiento» añade el 5, el 6… (`POST /proceso/lead/:leadId/seguimiento`). La cola del día no cambia: sigue sacando a quien ya se contactó según la regla de un paso por contacto y día.

**Correo de «¿por qué has desistido?»** (09/10). Sale en **un solo caso**: tras **7 días sin ninguna interacción** (de cualquier tipo, también una nota), con un primer contacto y sin comprar. Ya no sale al descartar a alguien. `FEEDBACK_DIA7_INICIO` sigue mirando el primer contacto.

**Resumen del día de dirección:** a las 19 del reloj del servidor (`RESUMEN_HORA`, las 21:00 de Madrid). La tarea mira cada 30 minutos y la primera vez a los 30 minutos de arrancar: **no reiniciar la API entre las 21:31 y las 22:00 de Madrid**, o ese día no sale. El reporte semanal sale los lunes. Un superadmin recibe todas las empresas, tenga o no campus asignados.


## Certifex: enlace en producción (#272)

Certifex emite los diplomas; el CRM decide **quién** lo recibe y **cuándo** se le avisa. Pantallas: Matrículas → **Certificaciones** (Emisiones y Consultas de la web) y Matrículas → **Diplomas** (lo que piden los alumnos desde Moodle; también en el menú, Clientes → Diplomas). Solo admin y superadmin aprueban, emiten, envían, corrigen y revocan; soporte ve las Consultas.

**Lo que hace el CRM y lo que no.** Emitir **no** manda correo: el diploma queda «pendiente de aviso» y alguien lo envía con «Enviar diploma al alumno» después de ver el PDF. Rechazar tampoco avisa: el aviso de rechazo es otro botón. Un nombre mal escrito se **corrige** (mismo número y mismo QR, queda quién y por qué), no se revoca. Al emitir, el CRM manda el **programa oficial** de la formación vendida (horas de `products.horas` y temario de `product_modules`) si la encuentra sin dudas: el campus de Certifex tiene que casar con **un** proyecto del CRM por nombre o slug (PSIKO → «Psiko Aprende», ACADEMIAIA → «Academia IA») y la venta, con el nombre del curso de Moodle. Si no, se emite con lo de Moodle y el panel lo dice antes de aprobar.

**Variables — backend (`.env` del servidor, nunca en el frontal):**

| Variable | Qué es |
|---|---|
| `CERTIFEX_API_URL` | La URL de Certifex (`https://certifex.tech`). Sin ella y sin la clave, «Certifex no está conectado». |
| `CERTIFEX_CRM_CLAVE` | La clave de este CRM (`cfx_crm_…`). La genera Certifex en **su** servidor con `npm run crm:clave` y la deja en un fichero 600; se trae por el canal de secretos y se borra el fichero. Volver a ejecutarlo la rota. |
| `CERTIFEX_PUBLICO_URL` | Opcional: la web pública (verificación y PDF) si algún día no es la de la API. |
| `CERTIFEX_WEBHOOK_SECRETO` | Secreto compartido con el que Certifex entrega consultas (`POST /api/certifex/consultas`) y solicitudes de diploma (`POST /api/certifex/solicitudes`). En Certifex es `CRM_CONSULTAS_SECRETO`, con `CRM_CONSULTAS_URL=https://<crm>/crm/api/certifex/consultas` (las solicitudes van a `…/solicitudes`, o a `CRM_SOLICITUDES_URL`). Sin él, las dos entradas responden 404. `openssl rand -hex 32`. |

**Interruptor — frontal:** `VITE_CERTIFEX_PANEL=1` enseña Certificaciones y Diplomas (`frontend/src/shared/lib/certifexPanel.ts`). Sin ponerla: **apagado en producción**, encendido en local y en /testeo; `=0` lo apaga también en pruebas. Se lee al compilar: cambiarla pide `npm run build` del frontal de ese entorno. Solo enseña las pantallas: lo que conecta es el backend.

**Migraciones:** `186_certifex_consultas.sql` (consultas de la web, si aún no está) y `199_certifex_solicitudes_diploma.sql`: solicitudes y aviso de rechazo; las columnas de lo revisado a mano antes de aprobar («Editar»: `email_crm`, `producto_id`, `programa_editado`, `editado_por`, `editado_en`), y las del aviso «ha terminado la formación» (`completado_en`, `completado_nota`, `completado_recibido_en`). Las dos son reaplicables (todo va con `IF NOT EXISTS`). **La 198 aún no está aplicada en ningún servidor** (09/10): si se hubiera aplicado ya en alguno con una versión anterior, hay que **reaplicarla** para que tenga las columnas nuevas. (La `175` del repositorio es «paso hecho a mano», no tiene que ver con Certifex.)

**Avisos que entrega Certifex** (los tres con `X-Certifex-Secreto`; sin el secreto configurado, 404; con otro, 401): `POST /api/certifex/consultas`, `POST /api/certifex/solicitudes` (el alumno pide el diploma) y `POST /api/certifex/completados` (Moodle da la formación por terminada y el alumno aún no lo ha pedido; en Certifex, `CRM_COMPLETADOS_URL` o la de consultas con `/completados`). Los tres son idempotentes y no rechazan enteras las entregas legítimas (correo vacío o mal escrito → sin correo; curso largo → recortado). La campana de solicitudes y de «terminados» suena solo a super admin y a los admin con el proyecto de ese campus.

**Cada admin, solo sus campus.** En Diplomas y en Certificaciones/Emisiones, un admin que no es super admin solo ve y toca los campus de Certifex cuyo proyecto del CRM tiene activo en `user_projects` (el campus casa con un único proyecto por nombre o slug). Lo ajeno no aparece en los listados y, en las acciones, responde 404. Super admin ve todo.

**Emitir con el programa del CRM, desde las dos pestañas.** «Aprobar y emitir», «Emitir» y el «Emitir» de Emisiones usan la misma emisión (`certifex.emision.js`). Si la base del CRM no contesta, no se aprueba ni se emite nada (error antes de llamar a Certifex). Una matrícula revisada a mano que aun así no tiene programa no se aprueba ni se emite (`emitir_bloqueado`).

**Orden de despliegue.**
1. **Certifex primero**: su versión con el contrato `/api/crm/v1` completo (decisiones, emitir con `items`/programa, avisos, avisos-rechazo, diplomas, revocar, corregir) y el plugin de Moodle de la solicitud.
2. **CRM en staging** (/testeo): migraciones 186 y 199 en `crm_test_db` (como se describe arriba: `postgres` + `dar-propiedad-a-crm-user.sql`), backend con las cuatro variables apuntando a un Certifex de pruebas, frontal de staging (el interruptor ya va encendido allí).
3. Comprobar en staging (abajo) y que Diego lo apruebe.
4. **CRM en producción**: PR a `main`, migraciones en `crm_prod_db`, variables en `/opt/crm/production/.env`, `pm2 restart crm-api-production`, y el frontal con `VITE_CERTIFEX_PANEL=1`.
5. **El último paso, en Certifex: el candado** (abajo). Hasta ese momento Certifex sigue emitiendo como antes.

**Cómo comprobar que está conectado.** `GET /api/certifex/emisiones/estado` con sesión de admin: `{"conectado": true, "nombre": "<CRM>", "centros": [...], "urlPublica": "…"}`. Si la clave no vale, `conectado: false` con el motivo; sin variables, `{"conectado": false}`. En la pantalla: el punto verde «Conectado como …» en Certificaciones y en Diplomas. La entrada de solicitudes: un `POST /api/certifex/solicitudes` sin la cabecera `X-Certifex-Secreto` tiene que dar **401** (404 = falta `CERTIFEX_WEBHOOK_SECRETO`).

**El candado de un centro.** `npm run crm:clave -- --nombre=CRM --centros=PSIKO,ISEIH,…` (en el servidor de Certifex) da de alta este CRM para esos centros, y **desde ese momento esos centros no emiten nada sin el OK del CRM** (lo sostiene la base de Certifex, no solo su API). Si el CRM aún no está desplegado y conectado, en esos centros no sale ningún diploma. Hacerlo centro a centro, empezando por un piloto, y solo con el CRM ya comprobado.

**Ningún correo sale solo:** ni al emitir, ni al revocar, ni al rechazar. Si el correo de Certifex está apagado (`CERTIFEX_EMAIL_ACTIVO`), al «Enviar» el panel lo dice («Aprobado, pero el correo está apagado») y queda registrado para reenviar.

## Versión 2.0.0 (en producción desde el 29/09/2026)

Lo nuevo, con un botón para ir a cada pantalla, está dentro del CRM en **Novedades** (`backend/src/modules/novedades/versiones.js`) y en la release `v2.0.0` de GitHub. En corto:

- **Proceso comercial**: la cola del día (por tramos: atrasados, hoy, mañana, semana), los pasos en la ficha, el seguimiento de fin de mes y el filtro por paso en Prospectos. Desde el 29/09 un contacto solo cierra **el paso que toca**, en su día y uno por día (`shared/utils/pasoCerrado.js`).
- **Feedback de quien no compra**: correo con la marca de cada campus al descartar y al 7.º día, encuesta de seis preguntas (con comentarios), panel en Análisis → Feedback y su parte en Reportes.
- **Novedades**: aviso en la campana, correo con PDF al equipo y el apartado para leerlas.
- **Correos del equipo**: resumen de la tarde por empresa, «Tu día y lo de mañana» y los de los lunes.
- **Claude por MCP** (#173, Diana): Conexión → MCP da una URL para consultar el CRM desde Claude, solo lectura y con el alcance de cada persona. **Conectores** (Captación) pueden ser de un campus, de una empresa o de todo el sistema, y el tipo «Claude (MCP)» saca una URL limitada a ese alcance.
- **Ventas y facturación**: venta sin gestora, número de factura al registrar, ventas compartidas, IVA incluido por defecto, avisos de huecos en la numeración.
- **Marca de cada campus** en correos y formularios (logo, color, fondo de cabecera, remitente y su cuenta de Brevo, editables desde el panel).

---

# Índice de migraciones SQL — ISEIH

Fuente de verdad del esquema. Cada archivo en `backend/migrations/` es un SQL ejecutado, en orden. Para el detalle exacto, abrir el .sql. (ISEIE tiene su propia numeración pero el esquema es equivalente por paridad.)

| # | Archivo | Qué hace |
|---|---|---|
| 001 | 001_initial_schema.sql | Schema inicial |
| 002 | 002_products_dossiers.sql | Tablas products y dossiers |
| 003 | 003_refresh_tokens.sql | Tabla refresh tokens |
| 004 | 004_reincidente.sql | Campo reincidente en leads |
| 005 | 005_expenses.sql | Tabla expenses (egresos) |
| 006 | 006_custom_fields.sql | Campos custom en leads |
| 007 | 007_api_credentials.sql | Tabla api_credentials |
| 008 | 008_accounts_payable.sql | Tabla accounts_payable (cuentas por pagar) |
| 009 | 009_product_categories.sql | Categorias y subcategorias de productos |
| 010 | 010_logos_and_product_pricing.sql | Logo empresa + campos comerciales de productos |
| 011 | 011_commissions.sql | Panel de comisiones por gestora (CRM-129) |
| 012 | 012_conversions_product_id.sql | Vincular conversion a producto (FK) |
| 013 | 013_platform_users.sql | Usuarios de plataforma (modo IA) |
| 014 | 014_user_avatar.sql | Avatar de usuario (CRM-186) |
| 015 | 015_project_modules.sql | Modulos configurables por proyecto (CRM-178) |
| 016 | 016_commissions_rediseno.sql | Rediseño comisiones (CRM-180) |
| 017 | 017_conversion_installments.sql | Cuotas en cuentas por cobrar (CRM-183) |
| 018 | 018_lead_form_columns.sql | Configuracion de campos base y columnas del listado de leads |
| 019 | 019_matriculas.sql | Matriculas (post-conversion) |
| 020 | 020_email_sequences.sql | Secuencias de email seguimiento (CRM-185) |
| 021 | 021_forms.sql | Editor de forms (CRM-175) |
| 022 | 022_payroll.sql | Nominas (CRM-171, CRM-173) |
| 023 | 023_woocommerce.sql | WooCommerce import + mapeo (CRM-177) |
| 024 | 024_forms_webhook_matriculas_admision_wc_autosync.sql | 3 mejoras |
| 025 | 025_webhook_listen_mode.sql | Modo escucha tipo Make/Zapier para webhook tokens |
| 026 | 026_role_soporte.sql | Rol "Desarrollador - Soporte" (rol generico que ve todos los proyectos) |
| 027 | 027_form_destination.sql | Webhook destination + listen mode default |
| 028 | 028_audiences_ia_reports_chat.sql | Tablas para audiences, ia metrics, reports, chat IA |
| 029 | 029_documents.sql | Módulo de documentos — facturas y certificados |
| 029 | 029_user_views.sql | Vistas personalizadas por usuario (CRM-301) |
| 030 | 030_field_definitions_multi_entity.sql | Campos custom multi-entidad (lead, client, product) |
| 030 | 030_installation_bundles.sql | Bundles de instalacion (CRM-302) |
| 031 | 031_performance_indexes.sql | índices FK faltantes + columna notificado_at en lead_reminders |
| 032 | 032_project_channels.sql | canales embebidos por proyecto (CRM-208 / CRM-211) |
| 033 | 033_roles_permissions.sql | Custom roles + overrides de permisos por usuario |
| 037 | 037_status.sql | Página de status del sistema |
| 038 | 038_lead_emails_and_shortcuts.sql | lead_emails (CRM-231) + projects.shortcuts (CRM-235) |
| 039 | 039_categories_tree.sql | árbol N niveles para product_categories |
| 039 | 039_document_audit_log.sql | Audit log de documentos (factura/certificado) |
| 040 | 040_documents_r2_and_email.sql | Documents — almacenamiento en R2 + auto-email |
| 040 | 040_role_views.sql | vista por defecto de roles custom |
| 041 | 041_product_image.sql | 041_product_image.sql |
| 042 | 042_email_templates.sql | 042_email_templates.sql |
| 043 | 043_external_panels.sql | paneles externos por proyecto (CRM-155) |
| 044 | 044_sidebar_labels.sql | etiquetas custom del sidebar por proyecto (CRM-217) |
| 045 | 045_product_modules.sql | módulos/temario de productos |
| 045 | 045_theme_color.sql | color primario por proyecto (CRM-191) |
| 046 | 046_project_connectors.sql | Conectores configurables por proyecto |
| 047 | 047_webhook_subtype.sql | distinguir webhook JSON vs mailhook (email entrante) |
| 048 | 048_wc_field_mapping.sql | mapping configurable para WC import |
| 049 | 049_webhook_default_product.sql | producto por defecto + matching por URL en webhooks |
| 050 | 050_form_template_events.sql | historial de eventos recibidos por webhook/mailhook/form |
| 051 | 051_wc_default_currency.sql | divisa por defecto del WC import (no por producto) |
| 052 | 052_wp_acf_importer.sql | importer multi-fuente WP REST + ACF |
| 053 | 053_unify_sections_as_text.sql | simplificar — secciones como TEXT unificado |
| 054 | 054_products_modalidad.sql | Añadir columna modalidad que el scraper rellena ("Online", "Presencial", etc.) |
| 055 | 055_leads_email_nullable.sql | email del lead pasa a ser NULLABLE |
| 056 | 056_add_whatsapp_canal.sql | añadir 'whatsapp' al enum utm_channel |
| 057 | 057_user_availability.sql | disponibilidad de gestores |
| 058 | 058_leads_soft_delete.sql | soft delete de leads + auditoría |
| 059 | 059_leads_propuesto.sql | flag "propuesto" |
| 060 | 060_conversion_refunds.sql | devoluciones (refunds) por conversión |
| 061 | 061_lead_spam_reports.sql | reportes de spam |
| 062 | 062_product_url_aliases.sql | alias de URLs por producto |
| 063 | 063_make_webhooks.sql | Make.com webhooks: cada proyecto puede tener N "conectores" hacia Make. |
| 064 | 064_messaging.sql | 064_messaging.sql — Sistema de mensajeria interna |
| 065 | 065_normalize_phones.sql | Normaliza todos los teléfonos al formato E.164 con +. |
| 066 | 066_products_list_index.sql | 066_products_list_index.sql |
| 066 | 066_sales_goals.sql | Metas de venta por gestor + periodo (mensual). |
| 067 | 067_admin_notifications.sql | Notificaciones para admin/superadmin (eventos que necesitan visibilidad operativa). |
| 068 | 068_sales_goal_history.sql | Historial de cambios en metas de venta. Snapshot del estado anterior cada |
| 069 | 069_meta_ads.sql | Integración Meta Marketing API (extracción de métricas, solo lectura). |
| 070 | 070_lead_audit_log.sql | Audit log de cambios en la ficha de un lead. |
| 071 | 071_dup_review_queue.sql | Cola de revisión de duplicados. |
| 072 | 072_lead_products.sql | Multi-cursos por lead (#18). |
| 073 | 073_meta_adsets_ads.sql | Etapa 3: AdSets y Ads. Misma forma que campaigns (snapshot + daily). |
| 074 | 074_meta_multi_account.sql | Multi-cuenta: un proyecto puede tener N cuentas publicitarias Meta. |
| 075 | 075_meta_adset_products.sql | Asociar productos a AdSets (no solo a campañas). Cada adset suele corresponder |
| 076 | 076_default_por_contactar.sql | Default del estado de un lead nuevo cambia de 'nuevo' → 'por_contactar'. |
| 077 | 077_change_requests.sql | Módulo RFC (Request For Change): solicitud de cambio + aprobaciones CCB + adjuntos. |
| 078 | 078_rfc_project_optional.sql | RFC sin proyecto = "General" (cambios cross-proyecto o de plataforma). |
| 079 | 079_user_projects_recibe_leads.sql | Opt-in per-project para que admins reciban leads del round-robin. |
| 080 | 080_admin_notifs_target_users.sql | Notificaciones dirigidas a usuarios concretos (no solo broadcast a admins). |
| 081 | 081_backfill_conversion_producto_id.sql | Backfill: rellenar conversions.producto_contratado_id matching por nombre. |
| 082 | 082_epic_b_expenses_extensions.sql | EPIC B — Egresos / Gastos |
| 083 | 083_leads_identificacion_fiscal.sql | 083 — Campo opcional de identificación fiscal en leads (para facturas). |
| 084 | 084_leads_direccion_fiscal.sql | 084 — Campo opcional de dirección fiscal en leads (para facturas). |
| 085 | 085_cpt_only_strategy.sql | 085 — Modo importer "cpt_only": sitios WP con CPTs custom pero SIN WooCommerce. |
| 086 | 086_project_integrations.sql | 086 — project_integrations: credenciales por proyecto para Stripe / Brevo / etc. |
| 087 | 087_lead_status_proxima_convocatoria.sql | 087 — Añade el valor 'proxima_convocatoria' al enum lead_status. |
| 088 | 088_stripe_payments.sql | stripe_payments |
| 089 | 089_stripe_disputes_extra.sql | Campos extra para gestion de disputas: |
| 090 | 090_invoices.sql | Facturacion (modelo aprobado 2026-06-17) |
| 091 | 091_invoices_extras.sql | metodo_pago, pie_pago, y reset de secuencia por admin |
| 092 | 092_conversion_items_iva.sql | multi-item en conversiones + IVA configurable |
| 093 | 093_whatsapp_widget.sql | Widget WhatsApp rotativo por proyecto |
| 094 | 094_invoices_rectificativa.sql | Facturas rectificativas (de abono) |
| 095 | 095_descuentos.sql | Descuentos por cuadros en conversiones y facturas |
| 096 | 096_invoice_issuers.sql | Multi-emisor de facturas |
| 097 | 097_issuer_logo_key.sql | 097_issuer_logo_key.sql |
| 098 | 098_invoice_templates.sql | Plantillas visuales de factura (editor tipo Canva). Cada plantilla guarda un |
| 099 | 099_issuer_serie.sql | 099_issuer_serie.sql |
| 100 | 100_template_condicion.sql | 100_template_condicion.sql |
| 101 | 101_fiscal_regimenes.sql | Regímenes fiscales + coletillas parametrizadas (editables desde el panel). |
| 102 | 102_sociedades.sql | Sociedades emisoras (agrupación de proyectos) + asignación proyecto→sociedad. |
| 103 | 103_facturacion_cimientos.sql | Cimientos de datos del módulo de facturación (spec v1.0, paso 1). |
| 104 | 104_numeracion_por_sociedad.sql | Numeración por sociedad (spec REQ-NUM-01/02): el contador de facturas es por |
| 105 | 105_proformas.sql | Proformas / presupuestos |
| 106 | 106_invoices_borrador.sql | Facturas en BORRADOR (preliminares) |
| 107 | 107_invoice_per_payment.sql | 107_invoice_per_payment.sql |
| 108 | 108_installment_concepto.sql | Concepto editable por cuota (mensualidades/fraccionados): predefinidos + otros. |
| 109 | 109_factura_manager.sql | Permiso factura_manager: gestora que puede gestionar (editar, corregir, abonar, |
| 110 | 110_editar_fechas_factura.sql | Permiso acotado: usuario que SOLO puede cambiar las fechas (emisión y pago) de |
| 111 | 111_conversion_vendedora.sql | Vendedora POR VENTA. El responsable del lead (leads.responsable_id) es quien |
| 112 | 112_factura_equivalente_eur.sql | Doble moneda MANUAL en facturas y pagos. |
| 113 | 113_stripe_fee_neto.sql | Comisión y neto liquidado por Stripe en cada cobro. |
| 115 | 115_facturacion_al_dia.sql | Corte de facturacion: hasta que dia esta la facturacion puesta al dia. |
| 116 | 116_stripe_revisado_y_proforma_aprobacion.sql | 1) Hasta que fecha estan ya revisados los cobros de Stripe. |
| 117 | 117_conversion_es_mensualidad.sql | Marcar una venta como "esto en realidad es una mensualidad". |
| 118 | 118_payment_method_valores_que_faltaban.sql | 118 · El enum payment_method se habia quedado corto |
| 119 | 119_invoices_cliente_tipo.sql | 119 · La factura necesita saber si el cliente es empresa o persona |
| 120 | 120_invoice_issuers_alias.sql | Un nombre corto para distinguir emisoras que comparten datos fiscales. |
| 121 | 121_conversion_payments_metodo.sql | conversion_payments.metodo |
| 122 | 122_whatsapp_templates.sql | Plantillas de WhatsApp en base de datos, por proyecto y con ambito compartida/personal. **Sin aplicar en produccion** (tarea #21). |
| 123 | 123_tutores_rol.sql | Tutores · el rol nuevo. |
| 124 | 124_tutores.sql | Tutores y colaboraciones · las tablas. |
| 125 | 125_reembolsos_y_comisiones.sql | Reembolsos: de que pago son, y que pasa con la comision del tutor. |
| 126 | 126_gestor_colaboraciones.sql | Permiso gestor_colaboraciones: da de alta tutores y les asigna cursos sin ser administrador. |
| 127 | 127_registro_de_correos.sql | Todo correo que el CRM intenta mandar, saliera o no, con clave de idempotencia. **Sin aplicar.** |
| 128 | 128_whatsapp_conversaciones.sql | Conversaciones y mensajes de WhatsApp. Es la tabla base del chat. |
| 129 | 129_whatsapp_consentimiento.sql | Quien acepto enlazar un numero, y cuando. Sin ella el aviso se ve pero no queda registro. |
| 130 | 130_whatsapp_responde_a.sql | A que mensaje responde cada mensaje. Sin ella el mensaje se guarda igual, pero se pierde la cita. |
| 131 | 131_lead_whatsapp_usuario.sql | El usuario de WhatsApp del prospecto, aparte del telefono (#65). |
| 132 | 132_avisos_por_correo.sql | Que avisos por correo ha apagado cada persona. **Sin aplicar.** |
| 133 | 133_tutor_banco.sql | El banco donde se le paga al profesor. Sin ella no se le puede transferir. |
| 134 | 134_whatsapp_participante.sql | Quien escribio cada mensaje dentro de un grupo. Sin ella el grupo se lee sin saber de quien es cada linea. |
| 135 | 135_wa_mensajes_unico_por_conversacion.sql | Un mensaje no puede entrar dos veces en la misma conversacion. |
| 136 | 136_numero_de_factura_unico_por_serie.sql | Un numero de factura por serie y año, mire desde el proyecto que mire. Es lo que impide repetir un numero como paso en CEDIA. |
| 137 | 137_claves_por_entorno.sql | El panel de claves: una credencial por servicio Y entorno, y los servicios que faltaban (#80). |
| 138 | 138_densidad_de_tabla_cabe.sql | `table_density` era VARCHAR(10) y «comfortable» mide 11: la preferencia no se podia guardar. |
| 139 | 139_banco_de_mensajes.sql | Los indices que necesita el banco de mensajes, que recorre todo por fecha en vez de un hilo (#101). |
| 140 | 140_tipos_de_proyecto.sql | Los tipos de proyecto que faltaban: educacion, ecommerce, servicios, inmobiliaria (#15). Sin ella el CRM no se rompe: los tipos nuevos salen como no disponibles y elegir uno contesta 409 diciendo que falta esta migracion. |
| 141 | 141_columnas_por_entidad.sql | `client_columns` y `product_columns` en `projects`: la pestaña Columnas servia solo para prospectos (#8). Sin ella la pestaña sigue funcionando para leads y las otras dos salen deshabilitadas. |
| 142 | 142_plazas_y_cierre.sql | #86 · Plazas y cierre de convocatoria en el catalogo. |
| 143 | 143_pasos_comerciales.sql | #87 · Los cinco pasos del proceso comercial, en la base y editables. |
| 144 | 144_registro_tareas.sql | El diario de las tareas programadas, para la pantalla de registro (#111). Sin ella el registro funciona igual: la fuente «Tareas» sale tachada y la pantalla avisa de que falta esta migracion, en vez de enseñar cinco fuentes como si fueran seis. |
| 145 | 145_gasto_de_ia.sql | Lo que cuesta la IA, apuntado (#30, y sobre todo #22) |
| 146 | 146_agenda_del_lead.sql | La agenda de cada prospecto: qué paso del proceso le toca y qué día. |
| 147 | 147_convocatorias.sql | Las convocatorias, y a quién se le ofrecieron (#86). |
| 148 | 148_proyecto_de_pruebas.sql | Un proyecto marcado como DE PRUEBAS, para trastear en producción sin |
| 149 | 149_busqueda_de_tutor.sql | Si se está buscando tutor para una formación, y con qué anuncio. |
| 150 | 150_ventas_compartidas.sql | Una venta, dos gestoras: repartir el mérito sin descuadrar los totales. |
| 151 | 151_plantillas_proceso_comercial.sql | Las plantillas del proceso comercial, cargadas de verdad. |
| 152 | 152_plantillas_dia4_y_opiniones.sql | El dia 4 donde no hay CETLAT, y el enlace real de opiniones. |
| 153 | 153_plantilla_pide_adjunto.sql | Plantillas que llevan una imagen detrás. |
| 154 | 154_plazas_solo_aviso.sql | Las plazas NO las lleva el CRM: solo avisa de que hay que mirarlas. |
| 155 | 155_revision_de_la_base.sql | Que quede apuntado que una ficha se reviso (#132) |
| 156 | 156_estados_comision_tutor.sql | Los estados de la comision del tutor: dos mas. |
| 157 | 157_entregables_del_tutor.sql | Que ha entregado cada tutor de cada formacion. |
| 158 | 158_numerar_al_convertir.sql | Quien puede poner el numero de factura EN EL MOMENTO de registrar la venta. |
| 160 | 160_avisar_al_tutor.sql | «Avisar tutor»: el correo mensual de comisiones que pidio Diego el 14/09. |
| 161 | 161_datos_de_cedia.sql | Los datos fiscales de CEDIA, que estaban sin rellenar. |
| 162 | 162_factura_no_requerida.sql | La columna `conversions.factura_no_requerida`, que nunca tuvo migración. |
| 163 | 163_estados_de_la_comision.sql | Los estados de la comisión del tutor. Diego, 14/09: |
| 164 | 164_huecos_de_las_plantillas.sql | Las plantillas de correo del proceso comercial no rellenaban ni un hueco. |
| 165 | 165_datos_de_ictess.sql | Los datos fiscales de ICTESS, que seguia con el marcador. |
| 166 | 166_cuerpo_de_los_correos.sql | Guardar el correo, no solo que se mandó. Primera parte del #146. |
| 167 | 167_usa_whatsapp.sql | La casilla «usa el WhatsApp del CRM», por persona (#128). Nace encendida para quien ya tiene conversaciones y apagada para el resto. Sin ella el CRM se queda EXACTAMENTE como hoy —sale todo el que puede por su rol— y la casilla de la ficha aparece sin poder tocarse, diciendo que falta esta migracion. |
| 168 | 168_etiquetas_de_whatsapp.sql | Las etiquetas de WhatsApp de cada gestora y en que chats estan puestas (#128, #138). Sin ella no se guarda ninguna: la lista de chats no enseña etiquetas, el boton de la cabecera no se pinta y los avisos de WhatsApp se descartan sin error. Nada mas deja de funcionar. |
| 169 | 169_etiquetas_pendientes.sql | Las etiquetas que llegan ANTES que su conversacion (#138). Al enlazar, WhatsApp manda las etiquetas antes que el historial: sin esta tabla se tiraban y no hay forma de recuperarlas —Evolution guarda las de cada chat pero no las devuelve por ningun endpoint—. Con una cuenta Business eso perdia la clasificacion entera de la gestora, en silencio. Sin ella, todo lo demas de etiquetas funciona: solo se pierde lo que llegue antes de tiempo. |
| 170 | 170_lid_de_la_conversacion.sql | La otra llave de cada conversacion: el `@lid` si se guardo por telefono, o el telefono si se guardo por `@lid` (#138). WhatsApp direcciona cada vez mas por `@lid` y los avisos de etiquetas usan el que tengan a mano: sin esto una etiqueta puesta desde el movil no encuentra su chat. Ademas el puente traduce el `@lid` y Evolution no, asi que sin ella el resultado cambia entre local y produccion. Sin aplicarla, esas etiquetas se quedan esperando en la 169 en vez de perderse. |
| 171 | 171_correo_recibido.sql | El correo que ENTRA. Segunda mitad del #146. |
| 171 | 171_hora_de_sincronizacion.sql | La hora a la que sincroniza cada proyecto su catalogo. |
| 172 | 172_plantilla_por_paso.sql | Cada plantilla, atada a su paso del proceso comercial. |
| 173 | 173_correo_por_paso.sql | El correo de cada paso, atado al paso (la otra mitad del #88). |
| 174 | 174_roles_adicionales.sql | Un usuario puede tener MAS DE UN ROL. |
| 175 | 175_paso_hecho_a_mano.sql | Marcar un paso a mano, y que el estado del prospecto lo siga |
| 176 | 176_feedback.sql | El correo de «¿por qué has desistido?» y lo que contesta cada uno |
| 177 | 177_remitente_no_contestar.sql | El remitente «no contestar» de cada campus |
| 178 | 178_feedback_respuestas.sql | La encuesta de feedback, con todas sus preguntas |
| 179 | 179_remitentes_campus.sql | El «no responder» de cada campus, para el correo de feedback |
| 180 | 180_cabecera_de_marca.sql | El fondo de la cabecera de cada marca, en correos y formularios |
| 181 | 181_novedades.sql | Las novedades de cada versión: cuándo y a quién se mandaron |
| 182 | 182_mcp_acceso.sql | Conexion de Claude al CRM por MCP (Model Context Protocol). |
| 183 | 183_conectores_alcance.sql | Conectores de un campus, de una EMPRESA o de TODO el sistema. |
| 184 | 184_mcp_por_conector.sql | Un token del MCP de Claude puede nacer de un CONECTOR. |
| 185 | 185_conectores_creador.sql | Quién creó cada conector, y cada conexión de Claude. |
| 186 | 186_certifex_consultas.sql | Las consultas que llegan desde la web de Certifex. |
| 187 | 187_emisor_bic.sql | El BIC/SWIFT de cada sociedad emisora, para las facturas por transferencia. |
| 188 | 188_enlace_opynio_iseie.sql | El enlace de Opynio de ISEIE (#209). |
| 189 | 189_mcp_codigo_desbloqueo.sql | Código de desbloqueo del MCP de Claude (#192). |
| 190 | 190_mcp_caducidad_y_rotacion.sql | MCP de Claude: caducidad, rotación y URLs sin usar (#194). |
| 191 | 191_mcp_auditoria_visible_y_alertas.sql | MCP de Claude: auditoría visible y alertas (#195). |
| 192 | 192_mcp_interruptor.sql | Interruptor de emergencia del MCP de Claude (#196). |
| 193 | 193_tasks_tablero.sql | Tablero de tareas del equipo (#210): tareas, historial, lista de comprobación, comentarios y etiquetas. |
| 194 | 194_rol_colaborador.sql | El rol `colaborador` en el ENUM `user_role`: solo ve el Equipo de Desarrollo (#210, lo comparte #202). |
| 195 | 195_tasks_enlaces.sql | Los enlaces de la tarjeta de una tarea (#210). |
| 196 | 196_tasks_areas_columns_external.sql | Tablero (#210, 07/10): columnas propias (`tasks.status` pasa a apuntar a `task_columns`; las tareas conservan su columna), áreas, proyectos propios con CHECK «campus o proyecto propio», y etiquetas sin repetir. Se puede pasar dos veces sin deshacer lo configurado. |
| 197 | 197_permisos_por_rol.sql | Permisos de Tareas por rol («Aprobar y cerrar» y «Configurar»), editables desde Configuración › Roles por el superadmin y el admin (#210, 08/10). Guarda solo lo que se aparta del valor por defecto del código; el orden es: por defecto del rol → esta tabla → rol a medida → excepciones de la persona. Se puede pasar dos veces. |
| 198 | 198_facturas_colaborador.sql | Facturas de colaboradores (#202, Diana): colaboradores, sus empresas e importe acordado, la factura de cada mes con su enlace y el registro (solo añadir). Se puede pasar dos veces. |
| 199 | 199_certifex_solicitudes_diploma.sql | Certifex · Diplomas (#272): las solicitudes de diploma que avisa Certifex desde Moodle, lo revisado a mano antes de aprobar («Editar») y el aviso «ha terminado la formación». Se puede pasar dos veces. |

> **09/10/2026, comprobado contra el catálogo de producción:** aplicadas hasta la **195**. La 193–195
> (tablas del tablero de Hugo, #210, y el rol `colaborador`) están, pero vacías y sin pantalla: el
> tablero va detrás de `SOLO_EN_PRUEBAS`. La **196** solo en /testeo; va con el tablero cuando se apruebe.
>
> **Comprobado el 29/09/2026 contra el catálogo de producción** (no contra la
> salida de ningún comando): aplicadas todas las de esta lista hasta la **184**.
> Las de la 2.0.0 se aplicaron ese día (160, 164, 166, 171 correo recibido y 175–184).
> De la 185 en adelante están listadas, pero esta tabla no dice si ya están aplicadas
> en cada servidor: compruébalo en `_migraciones` antes de dar una por puesta.


> **Comprobado el 04/09/2026 contra el catalogo de las dos bases**, no contra la
> salida de ningun comando: un `sudo` que pide contraseña devuelve un aviso sin
> la palabra ERROR y una migracion se da por aplicada sin estarlo. Paso.
>
> - **MultiCRM**: todas aplicadas de la 131 a la 141. Falta la **132**.
> - **ISEIE**: aplicadas hasta la **136**. De la 137 a la 141 no van todavia
>   porque son del panel de claves (#80), las columnas por entidad (#8) y los
>   tipos de proyecto (#15), y ese trabajo aun no esta portado alli.
>
> Y ojo con el **#71**: `crm_user` no es dueño de los tipos ni de varias tablas,
> asi que `ALTER TYPE` y `ALTER TABLE` fallan con «must be owner of». Esas hay
> que pasarlas como `postgres` (`sudo su - postgres -c "psql ..."`) hasta que se
> aplique `scripts/dar-propiedad-a-crm-user.sql`.
> El modulo esta apagado alli con `VITE_MODULOS_APAGADOS=whatsapp`, asi que
> encenderlo es quitar esa linea *y* aplicar las que falten. Nada revienta si no
> estan: el codigo comprueba y se degrada — sin la 122 no hay plantillas, sin la
> 129 no queda registro de quien acepto el aviso, sin la 130 se pierde a que
> mensaje contestaba una respuesta citada.
>
> **Las dos del correo (127 y 132) estan escritas y sin aplicar.** Las aprueba
> Diego, como todas. Mientras no esten:
>
> - sin la **127**, el envio de correo funciona pero no queda registro de nada:
>   ni de lo que salio, ni de lo que fallo, ni del freno de pruebas — y la
>   pantalla de Estado del sistema saldra vacia. Ademas, **sin ella la
>   idempotencia no frena nada**: la clave se guarda en esa tabla, asi que una
>   tarea repetida vuelve a mandar el correo.
> - sin la **132**, los avisos de recordatorios llegan a todo el mundo y nadie
>   puede apagarselos. La consulta que los busca la usa, asi que **sin la tabla
>   los avisos ni se mandan**: falla la consulta y el trabajo lo registra sin
>   tumbar nada.
>
> Ojo con el numero: la 128 ya estaba cogida por WhatsApp. La de los avisos es
> la **132**.


---

# Módulo de Facturación — MultiCRM (documento completo)

> **Estado:** documento vivo de diseño e implementación.
> **Base:** *Especificación Funcional — Módulo de Facturación MultiCRM v1.0* (Manuel Casas, 2026-07-02).
> **Alcance:** aplica a **ambos CRMs** (ISEIH `360crm.tech/crm` e ISEIE `crm.iseie.com`), que comparten el mismo código de facturación (paridad).
> **Autores implementación:** Diego (backend) · Ángel (frontend).

Este documento consolida el spec funcional con **lo que ya está construido**, el **análisis de brechas por REQ**, la **arquitectura de datos**, el **plan para conectar proyectos ↔ sociedades** y el **roadmap por fases**. Convención: ✅ hecho · 🟡 parcial · ⛔ pendiente.

---

## 1. Resumen ejecutivo

El módulo `invoices` ya cubre buena parte del **motor común** del spec (numeración por serie, PDF configurable, rectificativas, snapshot fiscal, IVA/descuentos, plantillas condicionales). Lo que falta es sobre todo **el motor fiscal por producto/cliente**, **las proformas**, la **numeración a nivel de sociedad** (hoy es por proyecto), la **auto-facturación de todo pago**, el **panel por sociedad + ALL**, y los campos de **moneda/tipo de cambio** y **reserva Verifactu**.

| Área | Estado | Nota |
|---|---|---|
| Multi-emisor (sociedades emisoras) | ✅ | `invoice_issuers` con NIF, domicilio, IBAN, logo, serie propia |
| Serie correlativa | 🟡 | Existe, pero **keyed por proyecto**, no por sociedad (ver §4) |
| Tipos: factura / rectificativa | ✅ | `tipo` = normal/rectificativa, abono con importes negativos y serie `R+serie` |
| Tipos: proforma | ⛔ | No implementado |
| PDF configurable (editor Canva) | ✅ | Bloques A4 drag&drop, plantillas por empresa, encabezados editables |
| Plantillas condicionales por país | ✅ | España / extranjero / todos — selección automática |
| Motor fiscal (IVA por producto + cliente) | 🟡 | Sólo IVA 21/incluido/exento + condición país. Falta régimen por producto y reglas UE/Canarias |
| Coletillas parametrizadas | 🟡 | `leyenda_iva` libre por factura; falta tabla de regímenes→coletilla editable |
| Auto-factura al detectar/registrar pago | 🟡 | Modal manual + sync Stripe; falta asignación automática de nº en TODO pago |
| Panel por sociedad + ALL + export | 🟡 | Panel por proyecto con filtros; falta consolidado por sociedad y export Excel |
| Reembolsos → rectificativa automática | 🟡 | Rectificativa manual; falta disparo automático desde refund de Stripe |
| Moneda + tipo de cambio (LATAM) | ⛔ | No implementado |
| Conservación de PDF | ✅ | PDF guardado en disco por proyecto/año |
| Reserva Verifactu (`hash_encadenado`, `qr`) | ⛔ | Campos aún no creados |

---

## 2. Arquitectura de dos capas (spec §2) — mapeo al código actual

| Capa del spec | Dónde vive hoy |
|---|---|
| **A. Motor común** (numeración, tipos, IVA, PDF, coletillas, rectificativas, panel) | `backend/src/modules/invoices/*` (`invoices.model.js`, `invoices.service.js`, `invoices.controller.js`, `invoices.routes.js`) + `frontend/src/modules/invoices/*` |
| **B. Configuración por sociedad/proyecto** (datos fiscales, series, régimen fiscal por producto) | `invoice_issuers` (sociedades) · `invoice_sequences` (series) · `invoice_templates` (diseño) · **falta** `regimenes_fiscales` y `productos.regimen_fiscal_id` |

**Principio:** dar de alta un proyecto nuevo debe ser **sólo configuración** (REQ-PROY-01). Hoy se cumple para emisor/serie/plantilla; falta el régimen fiscal por producto.

---

## 3. Sociedades emisoras y conexión de proyectos (spec §3)

Tres sociedades = tres NIF = tres series independientes. Los proyectos se reparten **entre los dos CRMs**, por eso las sociedades son un concepto **transversal** (una misma SL emite en ambos CRMs).

| Sociedad emisora (NIF) | Proyectos | CRM donde vive el proyecto |
|---|---|---|
| **Lateral Thinking Solutions SL** | Academia IA | (a confirmar) |
| **Ictess Ingeniería e Innovación SL** | ICTESS · Veterinary AI | ISEIE |
| **CEDIA Investigación y Desarrollo SL** | Fono Aprende · Psiko Aprende · ISEIH · ISAEG · Psicólogo IA · Nutricionista IA · Tarot IA · Sexólogo IA | ISEIH (+ los IA) |

### Plan de conexión (a ejecutar)
1. **Dar de alta las 3 sociedades** como `invoice_issuers` en cada CRM donde tengan proyectos (datos fiscales reales + serie + logo). *Hecho parcial: la UI de empresas emisoras ya existe.*
2. **Asignar cada proyecto a su sociedad por defecto**: nuevo campo `projects.sociedad_emisora_id` (→ `invoice_issuers.id`) para que al facturar un proyecto se **preseleccione** su sociedad sin elegir a mano. (REQ-PROY-01)
3. **Unificar la serie a nivel sociedad** (ver §4) para que todos los proyectos de CEDIA compartan el correlativo `CEDIA-2026-NNNN`.

> ⚠️ **Decisión pendiente de Manuel:** ¿la sociedad se asigna por proyecto (fija) o se puede elegir por factura? Recomendación: **por proyecto** (default) con opción de cambiar por factura para casos excepcionales.

---

## 4. Numeración y series (spec §4) — **brecha principal**

**Estado hoy:** `invoice_sequences` tiene clave primaria **`(project_id, año, serie)`**. La serie vive en `invoice_issuers.serie` y al emitir se usa esa serie, pero el **contador es por proyecto**.

**Problema:** si CEDIA emite para 8 proyectos con serie `CEDIA`, hoy habría **8 contadores** distintos con la misma serie → números repetidos o incoherentes entre proyectos. El spec exige **una única serie correlativa por sociedad** (REQ-NUM-01/02).

**Solución propuesta:**
- Cambiar la clave de secuencia a **`(sociedad/serie, año)`** en vez de por proyecto. Concretamente: nueva tabla `invoice_series` `(id, issuer_id, tipo, prefijo, año, contador_actual)` o migrar `invoice_sequences` a keyear por `issuer_id + serie + año`.
- El nº se asigna **atómicamente** dentro de la transacción de creación (ya se hace vía `nextNumero()` con `SELECT … FOR UPDATE`/UPSERT), sólo cambia la clave.

| REQ | Estado | Detalle |
|---|---|---|
| REQ-NUM-01 serie por sociedad | 🟡→⛔ | Hoy por proyecto. **Migrar a por sociedad.** |
| REQ-NUM-02 sin huecos, no reutilizable | ✅ | El nº se asigna y no se borra; anular ≠ borrar (ver §9) |
| REQ-NUM-03 cierre 31/dic, reinicio 01/ene | ✅ | La secuencia incluye `año`; el contador reinicia por año |
| REQ-NUM-04 formato `[SERIE]-[AÑO]-[NNNN]` | 🟡 | Hoy `AÑO/NNNN`. **Cambiar a `SERIE-AÑO-NNNN`** (p. ej. `CEDIA-2026-0001`) — confirmar con Manuel |
| REQ-NUM-05 series propias proforma/rectificativa | 🟡 | Rectificativa ya usa `R+serie`. **Falta proforma** (`PRO-…`) |

---

## 5. Tipos de documento (spec §5)

| Tipo | Estado | Implementación |
|---|---|---|
| **Factura** | ✅ | `invoices.tipo='normal'`, correlativa, se genera al registrar/detectar pago o manualmente |
| **Rectificativa** | ✅ | `tipo='rectificativa'`, serie `R+serie`, `rectifica_id`/`rectifica_codigo` (referencia obligatoria), importes negativos |
| **Proforma** | ⛔ | **Pendiente.** Nuevo `tipo='proforma'`, serie `PRO-…`, **sin consumir** el correlativo de facturas; al confirmarse el pago se genera la factura real |

**REQ-DOC-01 (regla clave):** *todo pago genera número de factura automáticamente*. 🟡 Hoy la emisión es manual o vía modal al registrar pago; falta que **todo** pago detectado/registrado asigne número aunque no se pida el PDF.

---

## 6. Registro y detección de pagos (spec §6)

| REQ | Estado | Detalle |
|---|---|---|
| REQ-PAG-01 Stripe automático | 🟡 | Ya hay sync de `stripe_payments` (cron 5 min) + asociación a conversiones. **Falta** el paso "cobro confirmado → crea factura con nº". |
| REQ-PAG-02 transferencia manual | 🟡 | Se registra pago en la conversión; hay modal "generar factura". **Falta** asignación automática de nº igual que Stripe. |
| REQ-PAG-03 proforma bajo petición | ⛔ | Depende de implementar proformas (§5). |

**Acción:** un servicio `emitInvoiceForPayment(pago)` común que, ante cualquier pago (Stripe o transferencia), resuelva sociedad → serie → nº → régimen fiscal → coletilla → crea `invoice` (+ PDF opcional). Es el corazón de REQ-DOC-01/PAG-01/02.

---

## 7. Motor fiscal — IVA y coletillas (spec §7) — **el núcleo pendiente**

Hoy el IVA es una decisión simple en el formulario (21% / incluido / exento) + plantilla por país. El spec pide un **motor** que combine **régimen del producto** × **ubicación/tipo de cliente**.

### 7.1 Régimen por producto (REQ-FIS-01) — ⛔
- Nueva tabla **`regimenes_fiscales`** `(id, nombre, aplica_iva bool, tipo_iva, coletilla)`.
- Nuevo campo **`products.regimen_fiscal_id`** (herramientas digitales → 21%; formación exenta → sin IVA).

### 7.2 Reglas por ubicación/cliente (REQ-FIS-02) — ⛔
Motor que resuelve el IVA final combinando régimen + origen del pago:

| Origen | IVA | Regla |
|---|---|---|
| España — con IVA | 21% incluido | producto no exento |
| España — exento | 0% | producto/formación exenta |
| Canarias | 0% (IGIC) | asimilada a exportación |
| UE B2B (VIES válido) | 0% | inversión del sujeto pasivo — requiere `nif_iva_vies` |
| UE B2C | según normativa | servicios digitales (a confirmar asesoría) |
| Fuera UE | 0% | no sujeta / exportación de servicios |

Requiere en el cliente: `pais`, `tipo (particular/empresa)`, `nif_iva_vies`. Los leads ya tienen país y NIF fiscal; **falta** `tipo` y `nif_iva_vies` + (opcional) validación VIES.

### 7.3 Coletillas automáticas (REQ-FIS-03) — 🟡
- Hoy `invoices.leyenda_iva` es texto libre por factura (se imprime en el PDF).
- **Falta** que la coletilla salga **de la tabla `regimenes_fiscales`** (editable, no hardcodeada) según el caso resuelto por el motor. Textos borrador en el spec §7.3 — **a validar con asesoría**.

---

## 8. Datos obligatorios (spec §8)

Capturados hoy en `invoices`: serie/nº, `fecha_emision`, emisor completo (snapshot `issuer_*`), descripción (items), cliente (nombre/nif/dirección/país/…), `base_imponible`, `iva_pct`/`iva_importe`, `total`, `leyenda_iva`. 

**Falta:** `fecha_operacion` (devengo, distinta de expedición) y `cliente.nif_iva_vies`. ✅ el resto está.

---

## 9. Panel de facturas (spec §9)

- ✅ Panel por proyecto (`InvoicesPage`) con lista, KPIs (facturado/cobrado/IVA), filtros (estado, fechas, búsqueda) y "Ventas sin factura".
- 🟡 **REQ-PAN-01/03:** falta la vista **por sociedad** y la **global "ALL"** consolidando las tres SL (columnas: Nº, Fecha, Cliente, Proyecto, Servicio, Base, IVA, Total, Estado).
- 🟡 **Estados:** hoy `emitida/enviada/pagada/cancelada`; el spec pide `pagada/rectificada/anulada/proforma`. **Alinear** el enum.
- ⛔ **REQ-PAN-04:** export a Excel/PDF para la asesoría.

---

## 10. Reembolsos, anulaciones, moneda, conservación (spec §10-11)

| REQ | Estado | Detalle |
|---|---|---|
| REQ-REE-01 refund Stripe → rectificativa | 🟡 | Rectificativa manual lista; **falta** disparo automático desde `charge.refunded` |
| REQ-REE-02 anulación sin borrar | ✅ | Cancelar marca estado, no borra nº (falta renombrar a "anulada") |
| REQ-MON-01 moneda + tipo de cambio | ⛔ | **Nuevos campos** `moneda`, `tipo_cambio`, importe en EUR para cobros LATAM (MXN/CLP/PEN) |
| REQ-CON-01 conservación PDF | ✅ | PDF persistido por proyecto/año; añadir política de retención 4/6 años |

---

## 11. Modelo de datos — actual vs objetivo

| Tabla spec | Tabla actual | Acción |
|---|---|---|
| `sociedades` | `invoice_issuers` | ✅ (renombra conceptualmente). Añadir link desde `projects` |
| `proyectos` | `projects` | ➕ `sociedad_emisora_id` |
| `series` | `invoice_sequences` | 🔧 **re-key por sociedad** + `tipo` (factura/proforma/rectificativa) |
| `regimenes_fiscales` | — | ➕ **crear** `(nombre, aplica_iva, tipo_iva, coletilla)` |
| `productos` | `products` | ➕ `regimen_fiscal_id` |
| `clientes` | `leads` | ➕ `tipo (particular/empresa)`, `nif_iva_vies` (país/NIF ya existen) |
| `facturas` | `invoices` (55 cols) | ➕ `fecha_operacion`, `moneda`, `tipo_cambio`, `pago_id`, `hash_encadenado`, `qr`; alinear `estado`; añadir `proforma` |
| `pagos` | `stripe_payments` + `conversion_payments` | 🔧 unificar concepto `pago(origen, importe, moneda, fecha, ref_externa)` |

`invoices` **ya incluye** el snapshot del emisor, `tipo`, `rectifica_id`, descuentos y `template_id` — buena base para no reconstruir nada.

---

## 12. Análisis de brechas por REQ

| REQ | Estado | Trabajo pendiente |
|---|---|---|
| REQ-PROY-01 | 🟡 | `projects.sociedad_emisora_id` + preselección |
| REQ-NUM-01 | ⛔ | Serie por **sociedad** (hoy por proyecto) |
| REQ-NUM-02 | ✅ | — |
| REQ-NUM-03 | ✅ | — |
| REQ-NUM-04 | 🟡 | Formato `SERIE-AÑO-NNNN` (confirmar) |
| REQ-NUM-05 | 🟡 | Serie de **proforma** |
| REQ-DOC-01 | 🟡 | Auto-nº en todo pago |
| REQ-PAG-01/02 | 🟡 | Servicio común `emitInvoiceForPayment` |
| REQ-PAG-03 | ⛔ | Proformas |
| REQ-FIS-01 | ⛔ | `regimenes_fiscales` + `products.regimen_fiscal_id` |
| REQ-FIS-02 | ⛔ | Motor de reglas ubicación/cliente (Canarias, UE B2B/B2C, fuera UE) |
| REQ-FIS-03 | 🟡 | Coletilla desde tabla editable |
| REQ-DAT-01 | 🟡 | `fecha_operacion`, `nif_iva_vies` |
| REQ-PAN-01/02 | ✅/🟡 | Panel por sociedad |
| REQ-PAN-03 | ⛔ | Vista ALL consolidada |
| REQ-PAN-04 | ⛔ | Export Excel/PDF |
| REQ-REE-01 | 🟡 | Refund Stripe → rectificativa auto |
| REQ-REE-02 | ✅ | Renombrar estado "anulada" |
| REQ-MON-01 | ⛔ | Moneda + tipo de cambio |
| REQ-CON-01 | ✅ | Política de retención |
| Verifactu-ready | ⛔ | Columnas `hash_encadenado`, `qr` (vacías) |

---

## 13. Roadmap propuesto (por fases)

- **Fase A — Sociedades y numeración correcta** *(base fiscal)*
  Alta de las 3 SL, `projects.sociedad_emisora_id`, re-key de series **por sociedad**, formato `SERIE-AÑO-NNNN`, estados alineados, columnas Verifactu-ready.
- **Fase B — Motor fiscal**
  `regimenes_fiscales` + `products.regimen_fiscal_id` + motor de reglas (España/Canarias/UE B2B-B2C/fuera UE) + coletillas parametrizadas + `nif_iva_vies` y `tipo` de cliente.
- **Fase C — Auto-facturación de pagos**
  `emitInvoiceForPayment` común (Stripe + transferencia), auto-nº en todo pago (REQ-DOC-01), refund Stripe → rectificativa (REQ-REE-01).
- **Fase D — Proformas** (serie propia, conversión a factura al pagar).
- **Fase E — Panel por sociedad + ALL + export** (Excel/PDF) y estados `pagada/rectificada/anulada/proforma`.
- **Fase F — Moneda/tipo de cambio** (cobros LATAM en EUR + tasa de la fecha de devengo).
- **(Futuro) Verifactu / Ley Antifraude** — sólo cuando se active; la base ya queda preparada.

Lo **ya construido** (multi-emisor, editor Canva, plantillas condicionales, rectificativas, snapshot fiscal, IVA/descuentos, unificación de facturación, numeración por empresa) es la base sobre la que se montan estas fases — **no hay que reconstruir**, sólo extender.

---

## 13.bis Decisiones confirmadas (2026-07-02)

- **Sociedades:** se crean desde **Empresas emisoras** (ya existe). La **serie la escribe/edita el admin o superadmin** (ya editable). Datos fiscales reales los carga el equipo.
- **Formato de numeración:** **configurable por el superadmin** (no fijo en código). El formato exacto (`SERIE-AÑO-NNNN` vs `AÑO/NNNN`) se decide al revisar las facturas reales.
- **Auto-facturación de pagos (prioridad):** un cobro de **Stripe** genera factura + correlativo automáticamente; un pago por **transferencia**, al registrarse, también recibe su correlativo. (REQ-PAG-01/02, Fase C).
- **Resumen descargable por mes/período** + **conteo de IVA aproximado** en el panel (Fase E). *IVA aprox. ya visible en la pantalla de Ventas.*
- **Comisiones (nuevo módulo):** modelo **mixto** — cada persona puede tener **salario fijo** y/o **comisión** (por **venta individual** con % propio, o por **equipo** según su participación). Se **suman**. (Fase H).
- **Ventas (simplificar):** mostrar nº de conversiones (hecho) + **eliminar conversión** (con salvaguardas: no borrar si tiene factura/pagos asociados).
- **"Cuadro de períodos al pagar":** en pausa hasta que Manuel lo aclare.

### 13.ter Requisitos nuevos (2026-07-02, 2ª tanda)

- **REQ-GATE-01 — Bloqueo de emisión sin datos fiscales:** el CRM **no debe permitir crear/emitir facturas** hasta que la **sociedad emisora** tenga sus datos fiscales completos. Aviso claro + enlace al panel. El bloqueo aplica **sólo a la emisión de facturas**; el resto del CRM sigue funcionando (leads, ventas, etc.) — *no rompe el flujo actual*.
- **REQ-GATE-02 — Validación exacta para España:** los datos fiscales del emisor deben validarse **para España**: razón social, **NIF/CIF válido** (DNI/NIE/CIF con dígito de control), dirección, ciudad, código postal y país. Sólo con todo correcto se habilita facturar.
- **REQ-PANEL-01 — Panel de sociedades:** un panel (dentro de *Configuración de facturación → Empresas emisoras*) donde el admin/superadmin **completa y ve el estado** de cada sociedad (✓ completa / ⚠ faltan campos), y desde donde se resuelve el bloqueo.
- **REQ-VISTA-01 — Vistas por sociedad:** las **vistas de proyectos se organizan por sociedad**. Cada proyecto pertenece a una sociedad (`projects.sociedad_emisora_id`) y el panel de facturación puede verse **por sociedad** y en **"ALL"** (consolidado). Depende de Fase A.
- **Mapeo confirmado:** **Academia IA → Lateral Thinking Solutions SL.**

## 15. Cómo trabajaremos en ambos CRMs (método de trabajo)

El módulo de facturación es **idéntico** en los dos CRMs (regla de **paridad absoluta**): ISEIH (`360crm.tech/crm`) e ISEIE (`crm.iseie.com`) comparten el mismo código de `invoices` y del motor fiscal. Toda mejora se hace **en los dos**.

**Reglas de trabajo:**
1. **Paridad de código:** los archivos del módulo `invoices` (backend `backend/src/modules/invoices/*` y frontend `frontend/src/modules/invoices/*`) se mantienen espejo entre ambos repos. Se editan en uno y se replican al otro. **Excepción:** archivos de navegación/rutas (Sidebar, App.jsx) y de branding **NO** se copian enteros — se hacen ediciones puntuales, porque difieren (ISEIE usa base `/accounting`, ISEIH `/finanzas`; sidebars distintos).
2. **Migraciones de DB:** cada cambio de esquema se aplica a **ambas** bases (`crm_prod_db` en ISEIH · `crm_iseie` en ISEIE). Numeración de migraciones independiente por repo.
3. **Sociedades transversales:** una misma sociedad (ej. **CEDIA**) emite en **ambos CRMs**, porque sus proyectos viven repartidos. Las sociedades se dan de alta como *empresas emisoras* en **cada CRM donde tenga proyectos**. Si más adelante se centraliza, se evaluará una tabla compartida.
4. **Reparto de proyectos → sociedad → CRM:**

   | Sociedad | Proyectos | CRM |
   |---|---|---|
   | Lateral Thinking Solutions SL | Academia IA | (confirmar) |
   | Ictess Ingeniería e Innovación SL | ICTESS · Veterinary AI | ISEIE |
   | CEDIA Investigación y Desarrollo SL | Fono Aprende · Psiko Aprende · ISEIH · ISAEG · Psicólogo IA · Nutricionista IA · Tarot IA · Sexólogo IA | ISEIH (+ IA) |

5. **Deploy:** cada cambio → build + deploy en los dos servidores (VPS ISEIH `187.124.128.126` vía SSH · VPS ISEIE `72.60.90.135` vía paramiko) + commit/push a `main` en ambos repos.
6. **Orden de fases (aplican a ambos):** A (sociedades + numeración + **gating fiscal**) → C (auto-factura pagos) → E (resumen/export) → H (comisiones) → B (motor fiscal). Cada fase se cierra en los dos CRMs antes de pasar a la siguiente.

## 14. Pendiente de Manuel / asesoría (antes de producción)

- Validar **textos de coletillas** (§7.3).
- Confirmar **formato de numeración** definitivo (REQ-NUM-04).
- Confirmar el **tratamiento fiscal exacto de cada producto** (exento vs 21%).
- Confirmar **régimen B2C UE** para servicios digitales.
- Confirmar si la **sociedad** es fija por proyecto o elegible por factura.
