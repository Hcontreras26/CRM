# Permisos del CRM: inventario

> **Generado** con `npm run permisos:inventario` (backend). No se edita a mano:
> sale de recorrer los routers de cada módulo (`modules/permissions/inventario/rutas.js`)
> y de las comprobaciones a mano apuntadas en `inventario/manuales.js`. Una prueba
> falla si el código cambia y esto no.

692 rutas en 56 módulos, y 24 acciones con condición dentro de una ruta.
Ningún guardia sin clasificar.

**Cómo leerlo.** «Qué la protege hoy» es lo que hay en el código: `roleGuard` deja pasar
además a superadmin y a soporte; `soloRoles` no. «Quién puede de verdad» lo calcula
la copia congelada de esas reglas (`inventario/legado.js`) para cada rol, sin casillas
ni excepciones, y dice qué casilla abre la puerta a quien no entra por su rol. El
alcance —qué campus, qué prospectos— no cambia quién entra y va al final.

## accounting

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| dashboard | `GET /api/accounting/dashboard` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| receivable | `GET /api/accounting/receivable` | sesión · roleGuard(admin, superadmin, soporte, gestor) +superadmin +soporte por el atajo | superadmin, admin, gestor, soporte |

## accounts-payable

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| list | `GET /api/accounts-payable/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| stats | `GET /api/accounts-payable/stats` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getOne | `GET /api/accounts-payable/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| create | `POST /api/accounts-payable/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| update | `PATCH /api/accounts-payable/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| remove | `DELETE /api/accounts-payable/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| addPayment | `POST /api/accounts-payable/:id/payments` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## audiences

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| preview | `POST /api/audiences/preview` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| exportCsv | `POST /api/audiences/export` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| uploadMeta | `POST /api/audiences/upload-meta` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| uploadHistory | `GET /api/audiences/upload-meta/history` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| uploadStatus | `GET /api/audiences/upload-meta/:uploadId/status` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |

## auth

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| login | `POST /api/auth/login` | nada (pública) | cualquiera, sin sesión |
| refresh | `POST /api/auth/refresh` | nada (pública) | cualquiera, sin sesión |
| logout | `POST /api/auth/logout` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| setPassword | `POST /api/auth/set-password` | nada (pública) | cualquiera, sin sesión |
| me | `GET /api/auth/me` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| changePassword | `POST /api/auth/change-password` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| updateMyProfile | `PATCH /api/auth/me` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| updateMyEmail | `PATCH /api/auth/me/email` | sesión · a mano: auth.controller.js · updateMyEmail | tutor |

## certifex

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| recibir | `POST /api/certifex/consultas` | nada (pública) | cualquiera, sin sesión |
| recibirSolicitud | `POST /api/certifex/solicitudes` | nada (pública) | cualquiera, sin sesión |
| recibirCompletado | `POST /api/certifex/completados` | nada (pública) | cualquiera, sin sesión |
| estado | `GET /api/certifex/emisiones/estado` | sesión · rol (admin, superadmin) o permiso diplomas.view | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| centros | `GET /api/certifex/emisiones/centros` | sesión · rol (admin, superadmin) o permiso diplomas.view | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| cursos | `GET /api/certifex/emisiones/cursos` | sesión · rol (admin, superadmin) o permiso diplomas.view | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| logo | `GET /api/certifex/emisiones/logo` | sesión · rol (admin, superadmin) o permiso diplomas.view | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| diploma | `GET /api/certifex/emisiones/diploma/:nexp` | sesión · rol (admin, superadmin) o permiso diplomas.view | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| resumen | `GET /api/certifex/diplomas/resumen` | sesión · rol (admin, superadmin) o permiso diplomas.view | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| solicitudes | `GET /api/certifex/diplomas/solicitudes` | sesión · rol (admin, superadmin) o permiso diplomas.view | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| porAvisar | `GET /api/certifex/diplomas/por-avisar` | sesión · rol (admin, superadmin) o permiso diplomas.view | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| terminados | `GET /api/certifex/diplomas/terminados` | sesión · rol (admin, superadmin) o permiso diplomas.view | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| diplomas | `GET /api/certifex/diplomas` | sesión · rol (admin, superadmin) o permiso diplomas.view | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| listar | `GET /api/certifex/consultas` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| actualizar | `PATCH /api/certifex/consultas/:id` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| listar | `GET /api/certifex/emisiones` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| decidir | `POST /api/certifex/emisiones/decisiones` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| emitir | `POST /api/certifex/emisiones/emitir` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| aprobarEmitir | `POST /api/certifex/diplomas/aprobar-emitir` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| emitir | `POST /api/certifex/diplomas/emitir` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| rechazar | `POST /api/certifex/diplomas/rechazar` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| avisos | `POST /api/certifex/diplomas/avisos` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| avisosRechazo | `POST /api/certifex/diplomas/avisos-rechazo` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| revocar | `POST /api/certifex/diplomas/revocar` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| corregir | `POST /api/certifex/diplomas/corregir` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| editar | `POST /api/certifex/diplomas/editar` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| subirFirma | `POST /api/certifex/diplomas/firma` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| verFirma | `GET /api/certifex/diplomas/firma/:matriculaId` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| nuevo | `POST /api/certifex/diplomas/nuevo` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| formaciones | `GET /api/certifex/diplomas/formaciones` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| sincronizarFormacion | `POST /api/certifex/diplomas/formaciones/sincronizar` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo · soloRoles(admin, superadmin) | superadmin, admin |
| diploma · el diploma en formato de imprenta | `GET /api/certifex/emisiones/diploma/:nexp` | cuando el diploma en formato de imprenta: a mano, certifex.emisiones.js · diploma | superadmin, admin |

## change-requests

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| list | `GET /api/change-requests/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| create | `POST /api/change-requests/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getById | `GET /api/change-requests/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| update | `PATCH /api/change-requests/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| remove | `DELETE /api/change-requests/:id` | sesión · roleGuard(admin, superadmin, project_manager) +superadmin +soporte por el atajo | superadmin, admin, soporte, project_manager |
| reopen | `POST /api/change-requests/:id/reopen` | sesión · roleGuard(admin, superadmin, project_manager) +superadmin +soporte por el atajo | superadmin, admin, soporte, project_manager |
| approve | `POST /api/change-requests/:id/approve` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getApprovalSignature | `GET /api/change-requests/approvals/:approvalId/signature` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| uploadAttachment | `POST /api/change-requests/:id/attachments` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| downloadAttachment | `GET /api/change-requests/attachments/:attachmentId/download` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| deleteAttachment | `DELETE /api/change-requests/attachments/:attachmentId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |

## claude-chat

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| status | `GET /api/claude/status` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listConversations | `GET /api/claude/conversations` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getMessages | `GET /api/claude/conversations/:conversationId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| chat | `POST /api/claude/chat` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |

## client-errors

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| (anónima) | `POST /api/client-errors/` | nada (pública) | cualquiera, sin sesión |

## commissions

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| listRules | `GET /api/commissions/rules` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| createRule | `POST /api/commissions/rules` | sesión · roleGuard(superadmin) +superadmin +soporte por el atajo | superadmin, soporte |
| updateRule | `PATCH /api/commissions/rules/:id` | sesión · roleGuard(superadmin) +superadmin +soporte por el atajo | superadmin, soporte |
| deleteRule | `DELETE /api/commissions/rules/:id` | sesión · roleGuard(superadmin) +superadmin +soporte por el atajo | superadmin, soporte |
| listMine | `GET /api/commissions/me` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| statsMine | `GET /api/commissions/me/stats` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listAll | `GET /api/commissions/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| statsAll | `GET /api/commissions/stats` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| pay | `PATCH /api/commissions/:id/pay` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| recalculate | `POST /api/commissions/recalculate/:conversionId` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## connectors

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| list | `GET /api/connectors/` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| mcpUrl | `POST /api/connectors/:id/mcp-url` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| getById | `GET /api/connectors/:id` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| create | `POST /api/connectors/` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| update | `PATCH /api/connectors/:id` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| remove | `DELETE /api/connectors/:id` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| preview | `POST /api/connectors/:id/preview` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| runImport | `POST /api/connectors/:id/import` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| create · conectores de todo el sistema (alcance «sistema») | `POST /api/connectors/` | cuando conectores de todo el sistema (alcance «sistema»): a mano, connectors.controller.js · esSuperadmin | superadmin |
| update · conectores de todo el sistema (alcance «sistema») | `PATCH /api/connectors/:id` | cuando conectores de todo el sistema (alcance «sistema»): a mano, connectors.controller.js · esSuperadmin | superadmin |
| remove · conectores de todo el sistema (alcance «sistema») | `DELETE /api/connectors/:id` | cuando conectores de todo el sistema (alcance «sistema»): a mano, connectors.controller.js · esSuperadmin | superadmin |

## conversions

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| list | `GET /api/conversions/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listProductos | `GET /api/conversions/productos` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| cuotas | `GET /api/conversions/cuotas` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| filas | `GET /api/conversions/filas` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listByLead | `GET /api/conversions/by-lead/:leadId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getById | `GET /api/conversions/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| create | `POST /api/conversions/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| update | `PATCH /api/conversions/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| addPayment | `POST /api/conversions/:id/payments` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| removePayment | `DELETE /api/conversions/payments/:paymentId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listInstallments | `GET /api/conversions/:id/installments` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| generateInstallments | `POST /api/conversions/:id/installments/generate` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| updateInstallment | `PATCH /api/conversions/installments/:instId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| payInstallment | `POST /api/conversions/installments/:instId/pay` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| editPaidInstallment | `PATCH /api/conversions/installments/:instId/paid` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| unpayInstallment | `POST /api/conversions/installments/:instId/unpay` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| deleteInstallment | `DELETE /api/conversions/installments/:instId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| get | `GET /api/conversions/:id/reparto` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| set | `PUT /api/conversions/:id/reparto` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| remove | `DELETE /api/conversions/:id/reparto` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| list | `GET /api/conversions/:id/refunds` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| create | `POST /api/conversions/:id/refunds` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| remove | `DELETE /api/conversions/refunds/:refundId` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| remove | `DELETE /api/conversions/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| addPayment · que el cobro salga ya facturado (si no, queda en la cola; no da 403) | `POST /api/conversions/:id/payments` | cuando que el cobro salga ya facturado (si no, queda en la cola; no da 403): a mano, conversion.service.js · autoInvoice (puedeEmitirFactura) | superadmin, admin y gestor/soporte/project_manager/tutor con «factura_manager» |

## convocatorias

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| embudo | `GET /api/convocatorias/embudo` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| pendientes | `GET /api/convocatorias/pendientes` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| deLead | `GET /api/convocatorias/lead/:leadId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| ofrecer | `POST /api/convocatorias/:id/ofrecer` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| actualizarOfrecimiento | `PATCH /api/convocatorias/ofrecimientos/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listar | `GET /api/convocatorias/` | sesión · projectAccess (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |
| crear | `POST /api/convocatorias/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| editar | `PATCH /api/convocatorias/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |

## correos

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| listar | `GET /api/correos/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| recuento | `GET /api/correos/recuento` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| sincronizar | `POST /api/correos/sincronizar` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| uno | `GET /api/correos/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## credentials

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| list | `GET /api/credentials/` | sesión · soloRoles(soporte, superadmin) | superadmin, soporte |
| paridad | `GET /api/credentials/paridad` | sesión · soloRoles(soporte, superadmin) | superadmin, soporte |
| registro | `GET /api/credentials/registro` | sesión · soloRoles(soporte, superadmin) | superadmin, soporte |
| upsert | `POST /api/credentials/` | sesión · soloRoles(soporte, superadmin) | superadmin, soporte |
| test | `POST /api/credentials/:id/test` | sesión · soloRoles(soporte, superadmin) | superadmin, soporte |
| revelar | `GET /api/credentials/:id/revelar` | sesión · soloRoles(soporte, superadmin) | superadmin, soporte |
| remove | `DELETE /api/credentials/:id` | sesión · soloRoles(soporte, superadmin) | superadmin, soporte |

## documents

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| list | `GET /api/documents/` | sesión · projectAccess (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |
| download | `GET /api/documents/:id/download` | sesión · projectAccess (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |
| audit | `GET /api/documents/:id/audit` | sesión · roleGuard(superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, soporte |
| peekNumber | `GET /api/documents/next-number` | sesión · roleGuard(superadmin, admin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| setNumber | `POST /api/documents/set-number` | sesión · roleGuard(superadmin, admin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| preview | `POST /api/documents/preview` | sesión · roleGuard(superadmin, admin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| generate | `POST /api/documents/generate` | sesión · roleGuard(superadmin, admin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| regenerate | `POST /api/documents/:id/regenerate` | sesión · roleGuard(superadmin, admin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| resendEmail | `POST /api/documents/:id/resend-email` | sesión · roleGuard(superadmin, admin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| remove | `DELETE /api/documents/:id` | sesión · roleGuard(superadmin, admin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |

## dossiers

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| upload | `POST /api/dossiers/upload` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| getPresignedUrl | `GET /api/dossiers/:id/url` | sesión · projectAccess (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |
| getHistory | `GET /api/dossiers/product/:productId/history` | sesión · projectAccess (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |

## email-sequences

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| list | `GET /api/secuencias-email/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listRuns | `GET /api/secuencias-email/runs` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getById | `GET /api/secuencias-email/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| create | `POST /api/secuencias-email/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| update | `PATCH /api/secuencias-email/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| remove | `DELETE /api/secuencias-email/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| startManual | `POST /api/secuencias-email/runs/start` | sesión · roleGuard(admin, superadmin, gestor) +superadmin +soporte por el atajo | superadmin, admin, gestor, soporte |
| stopRun | `POST /api/secuencias-email/runs/:runId/stop` | sesión · roleGuard(admin, superadmin, gestor) +superadmin +soporte por el atajo | superadmin, admin, gestor, soporte |

## email-templates

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| getVariables | `GET /api/email-templates/variables` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| list | `GET /api/email-templates/` | sesión · projectAccess (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |
| getById | `GET /api/email-templates/:id` | sesión · projectAccess (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |
| preview | `POST /api/email-templates/:id/render` | sesión · projectAccess (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |
| create | `POST /api/email-templates/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| update | `PATCH /api/email-templates/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| remove | `DELETE /api/email-templates/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |

## expenses

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| listExpenses | `GET /api/expenses/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| resumen | `GET /api/expenses/resumen` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| uploadComprobante | `POST /api/expenses/upload-comprobante` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| downloadComprobante | `GET /api/expenses/comprobante/:key` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getExpense | `GET /api/expenses/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| createExpense | `POST /api/expenses/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| updateExpense | `PATCH /api/expenses/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| deleteExpense | `DELETE /api/expenses/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## facturas-colaborador

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| (anónima) | `GET /api/facturas-colaborador/enlace/:token` | nada (pública) | cualquiera, sin sesión |
| (anónima) | `POST /api/facturas-colaborador/enlace/:token` | nada (pública) | cualquiera, sin sesión |
| archivoLocal | `GET /api/facturas-colaborador/archivo-local/:id` | nada (pública) | cualquiera, sin sesión |
| justificanteLocal | `GET /api/facturas-colaborador/justificante-local/:id` | nada (pública) | cualquiera, sin sesión |
| (anónima) | `GET /api/facturas-colaborador/mias` | sesión · checkPermission(facturas_colaborador.subir) sin roles de más | superadmin, colaborador y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `POST /api/facturas-colaborador/mias/:id` | sesión · checkPermission(facturas_colaborador.subir) sin roles de más | superadmin, colaborador y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `GET /api/facturas-colaborador/mias/:id/archivo` | sesión · checkPermission(facturas_colaborador.subir) sin roles de más | superadmin, colaborador y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `GET /api/facturas-colaborador/empresas` | sesión · permiso facturas_colaborador.ver_todas o facturas_colaborador.gestionar | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `GET /api/facturas-colaborador/colaboradores` | sesión · checkPermission(facturas_colaborador.gestionar) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `POST /api/facturas-colaborador/colaboradores` | sesión · checkPermission(facturas_colaborador.gestionar) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `GET /api/facturas-colaborador/colaboradores/:id` | sesión · checkPermission(facturas_colaborador.gestionar) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `PATCH /api/facturas-colaborador/colaboradores/:id` | sesión · checkPermission(facturas_colaborador.gestionar) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `POST /api/facturas-colaborador/colaboradores/:id/baja` | sesión · checkPermission(facturas_colaborador.gestionar) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `POST /api/facturas-colaborador/colaboradores/:id/alta` | sesión · checkPermission(facturas_colaborador.gestionar) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `GET /api/facturas-colaborador/colaboradores/:id/registro` | sesión · checkPermission(facturas_colaborador.gestionar) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `GET /api/facturas-colaborador/mes` | sesión · checkPermission(facturas_colaborador.ver_todas) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `GET /api/facturas-colaborador/facturas` | sesión · checkPermission(facturas_colaborador.ver_todas) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `GET /api/facturas-colaborador/coste-por-campus` | sesión · checkPermission(facturas_colaborador.ver_todas) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `GET /api/facturas-colaborador/zip` | sesión · checkPermission(facturas_colaborador.ver_todas) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `GET /api/facturas-colaborador/facturas/:id/archivo` | sesión · checkPermission(facturas_colaborador.ver_todas) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `GET /api/facturas-colaborador/facturas/:id/registro` | sesión · checkPermission(facturas_colaborador.ver_todas) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `GET /api/facturas-colaborador/facturas/:id/desglose` | sesión · checkPermission(facturas_colaborador.ver_todas) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `POST /api/facturas-colaborador/facturas/:id/anular` | sesión · checkPermission(facturas_colaborador.anular) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `POST /api/facturas-colaborador/facturas/:id/reenviar` | sesión · checkPermission(facturas_colaborador.gestionar) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `POST /api/facturas-colaborador/facturas/pagar` | sesión · checkPermission(facturas_colaborador.pagar) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `POST /api/facturas-colaborador/facturas/:id/deshacer-pago` | sesión · checkPermission(facturas_colaborador.pagar) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |
| (anónima) | `GET /api/facturas-colaborador/facturas/:id/justificante` | sesión · checkPermission(facturas_colaborador.ver_todas) sin roles de más | superadmin, admin y quien tenga el permiso por rol a medida o excepción |

## feedback

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| panel | `GET /api/feedback/panel` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| lista | `GET /api/feedback/lista` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| deUnLead | `GET /api/feedback/lead/:leadId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| enviarLoRevisado | `POST /api/feedback/lead/:leadId/enviar` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| noEnviar | `POST /api/feedback/lead/:leadId/no-enviar` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| servir | `GET /api/f/cabecera/:projectId` | nada (pública) | cualquiera, sin sesión |
| servir | `GET /api/f/cabecera/:projectId.png` | nada (pública) | cualquiera, sin sesión |
| servirInsignia | `GET /api/f/insignia/:projectId` | nada (pública) | cualquiera, sin sesión |
| encuesta | `GET /api/f/:token` | nada (pública) | cualquiera, sin sesión |
| responder | `POST /api/f/:token` | nada (pública) | cualquiera, sin sesión |

## field-definitions

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| listByProject | `GET /api/field-definitions/project/:projectId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| create | `POST /api/field-definitions/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| update | `PATCH /api/field-definitions/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| remove | `DELETE /api/field-definitions/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| reorder | `POST /api/field-definitions/reorder` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## forms

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| publicMeta | `GET /api/forms/public/:embedId` | nada (pública) | cualquiera, sin sesión |
| publicSubmit | `POST /api/forms/public/:embedId/submit` | nada (pública) | cualquiera, sin sesión |
| publicWebhook | `POST /api/forms/webhook/:embedId` | nada (pública) | cualquiera, sin sesión |
| publicMailhook | `POST /api/forms/mailhook/:embedId` | nada (pública) | cualquiera, sin sesión |
| list | `GET /api/forms/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getById | `GET /api/forms/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getStatus | `GET /api/forms/:id/status` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listEvents | `GET /api/forms/:id/events` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| create | `POST /api/forms/` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| update | `PATCH /api/forms/:id` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| remove | `DELETE /api/forms/:id` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| startListening | `POST /api/forms/:id/listen` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| stopListening | `POST /api/forms/:id/listen/stop` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## ia-monitor

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| getMetrics | `GET /api/ia/metrics/:projectId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getGasto | `GET /api/ia/gasto` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |

## installation

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| getInstallation | `GET /api/installation/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| updateInstallation | `PATCH /api/installation/` | sesión · roleGuard(superadmin) +superadmin +soporte por el atajo | superadmin, soporte |

## integrations

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| list | `GET /api/integrations/` | sesión · roleGuard(superadmin, admin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getOne | `GET /api/integrations/:provider` | sesión · roleGuard(superadmin, admin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| upsert | `PUT /api/integrations/` | sesión · roleGuard(superadmin, admin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| test | `POST /api/integrations/:provider/test` | sesión · roleGuard(superadmin, admin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| remove | `DELETE /api/integrations/:provider` | sesión · roleGuard(superadmin, admin) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## invoices

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| getIssuerLogo | `GET /api/invoices/issuers/:id/logo` | nada (pública) | cualquiera, sin sesión |
| facturacionAlDia | `GET /api/invoices/facturacion-al-dia` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| setFacturacionAlDia | `PUT /api/invoices/facturacion-al-dia` | sesión · a mano: invoices.controller.js · esFacturaManager | superadmin y admin/gestor/soporte/project_manager/tutor con «factura_manager» |
| generarDeCola | `POST /api/invoices/cola/generar` | sesión · a mano: invoices.controller.js · esFacturaManager | superadmin y admin/gestor/soporte/project_manager/tutor con «factura_manager» |
| emitirColaHasta | `POST /api/invoices/cola/emitir-hasta` | sesión · a mano: invoices.controller.js · esFacturaManager | superadmin y admin/gestor/soporte/project_manager/tutor con «factura_manager» |
| list | `GET /api/invoices/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| stats | `GET /api/invoices/stats` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| siguienteNumero | `GET /api/invoices/siguiente-numero` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| ventasSinFactura | `GET /api/invoices/ventas-sin-factura` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listRegimenes | `GET /api/invoices/regimenes` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| resolveRegimen | `GET /api/invoices/resolve-regimen` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| createRegimen | `POST /api/invoices/regimenes` | sesión · a mano: invoices.controller.js · isAdmin(req) | superadmin, admin, soporte |
| updateRegimen | `PATCH /api/invoices/regimenes/:id` | sesión · a mano: invoices.controller.js · isAdmin(req) | superadmin, admin, soporte |
| deleteRegimen | `DELETE /api/invoices/regimenes/:id` | sesión · a mano: invoices.controller.js · isAdmin(req) | superadmin, admin, soporte |
| listTemplates | `GET /api/invoices/templates` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| createTemplate | `POST /api/invoices/templates` | sesión · a mano: invoices.controller.js · isAdmin(req) | superadmin, admin, soporte |
| getTemplate | `GET /api/invoices/templates/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| updateTemplate | `PATCH /api/invoices/templates/:id` | sesión · a mano: invoices.controller.js · isAdmin(req) | superadmin, admin, soporte |
| deleteTemplate | `DELETE /api/invoices/templates/:id` | sesión · a mano: invoices.controller.js · isAdmin(req) | superadmin, admin, soporte |
| listIssuers | `GET /api/invoices/issuers` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| createIssuer | `POST /api/invoices/issuers` | sesión · a mano: invoices.controller.js · isAdmin(req) | superadmin, admin, soporte |
| updateIssuer | `PATCH /api/invoices/issuers/:id` | sesión · a mano: invoices.controller.js · isAdmin(req) | superadmin, admin, soporte |
| deleteIssuer | `DELETE /api/invoices/issuers/:id` | sesión · a mano: invoices.controller.js · isAdmin(req) | superadmin, admin, soporte |
| uploadIssuerLogo | `POST /api/invoices/issuers/:id/logo` | sesión · a mano: invoices.controller.js · isAdmin(req) | superadmin, admin, soporte |
| deleteIssuerLogo | `DELETE /api/invoices/issuers/:id/logo` | sesión · a mano: invoices.controller.js · isAdmin(req) | superadmin, admin, soporte |
| getConfig | `GET /api/invoices/config` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| updateConfig | `PATCH /api/invoices/config` | sesión · a mano: invoices.controller.js · isAdmin(req) | superadmin, admin, soporte |
| listSequences | `GET /api/invoices/sequences` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| setSequence | `POST /api/invoices/sequences` | sesión · a mano: invoices.controller.js · isAdmin(req) | superadmin, admin, soporte |
| leadFiscalData | `GET /api/invoices/lead-fiscal/:leadId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| byConversion | `GET /api/invoices/by-conversion/:conversionId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getOne | `GET /api/invoices/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| create | `POST /api/invoices/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| update | `PATCH /api/invoices/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| corregir | `PATCH /api/invoices/:id/corregir` | sesión · roleGuard(admin, superadmin, gestor) +superadmin +soporte por el atajo · a mano: invoices.model.js · puedeGestionarFactura | superadmin, admin y gestor con «factura_manager» |
| updateFechas | `PATCH /api/invoices/:id/fechas` | sesión · a mano: invoices.model.js · puedeEditarFechas | superadmin, admin y gestor/soporte/project_manager/tutor con «editar_fechas_factura» |
| marcarEntregada | `PATCH /api/invoices/:id/entregada` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| asociarVenta | `PATCH /api/invoices/:id/asociar` | sesión · roleGuard(admin, superadmin, gestor) +superadmin +soporte por el atajo · a mano: invoices.model.js · puedeGestionarFactura | superadmin, admin y gestor con «factura_manager» |
| pdf | `GET /api/invoices/:id/pdf` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| send | `POST /api/invoices/:id/send` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| markPaid | `POST /api/invoices/:id/mark-paid` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| cobrarProforma | `POST /api/invoices/:id/cobrar-proforma` | sesión · roleGuard(admin, superadmin, gestor) +superadmin +soporte por el atajo · a mano: invoices.controller.js · esFacturaManager | superadmin y admin/gestor/soporte con «factura_manager» |
| cancel | `POST /api/invoices/:id/cancel` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| destroy | `DELETE /api/invoices/:id` | sesión · roleGuard(admin, superadmin, gestor) +superadmin +soporte por el atajo · a mano: invoices.model.js · puedeGestionarFactura | superadmin, admin y gestor con «factura_manager» |
| rectificar | `POST /api/invoices/:id/rectificar` | sesión · roleGuard(admin, superadmin, gestor) +superadmin +soporte por el atajo · a mano: invoices.model.js · puedeGestionarFactura | superadmin, admin y gestor con «factura_manager» |
| emitir | `POST /api/invoices/:id/emitir` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| completarDatos | `POST /api/invoices/:id/completar-datos` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| create · la factura es rectificativa (de abono) | `POST /api/invoices/` | cuando la factura es rectificativa (de abono): a mano, invoices.controller.js · create | superadmin, admin y gestor con «factura_manager» |
| create · una proforma sin esperar visto bueno (si no, queda pendiente de aprobar; no da 403) | `POST /api/invoices/` | cuando una proforma sin esperar visto bueno (si no, queda pendiente de aprobar; no da 403): a mano, invoices.controller.js · create | superadmin, admin y gestor/soporte/project_manager/tutor con «factura_manager» |

## leads

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| webhook | `POST /api/leads/webhooks/:slug` | nada (pública) | cualquiera, sin sesión |
| list | `GET /api/leads/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| exportWasapi | `GET /api/leads/export/wasapi` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| stats | `GET /api/leads/stats` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| quickCounts | `GET /api/leads/quick-counts` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| progresoRevision | `GET /api/leads/revision` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| today | `GET /api/leads/today` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| lookupByEmail | `GET /api/leads/lookup-by-email` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| checkDuplicate | `POST /api/leads/check-duplicate` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listPending | `GET /api/leads/spam-reports` | sesión · roleGuard(superadmin) +superadmin +soporte por el atajo | superadmin, soporte |
| countPending | `GET /api/leads/spam-reports/count` | sesión · roleGuard(superadmin) +superadmin +soporte por el atajo | superadmin, soporte |
| resolveReport | `PATCH /api/leads/spam-reports/:reportId` | sesión · roleGuard(superadmin) +superadmin +soporte por el atajo | superadmin, soporte |
| listReviewQueue | `GET /api/leads/review-queue` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| listDuplicateGroups | `GET /api/leads/duplicados` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| decideReviewQueue | `POST /api/leads/review-queue/:id/decide` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| listLeadProducts | `GET /api/leads/:id/products` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| addLeadProduct | `POST /api/leads/:id/products` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| updateLeadProduct | `PATCH /api/leads/:id/products/:lpId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| removeLeadProduct | `DELETE /api/leads/:id/products/:lpId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getById | `GET /api/leads/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| mergeLeads | `POST /api/leads/:id/merge` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| revisar | `POST /api/leads/:id/revisar` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| createManual | `POST /api/leads/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| bulkCreate | `POST /api/leads/bulk` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| update | `PATCH /api/leads/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| changeStatus | `PATCH /api/leads/:id/status` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| addInteraction | `POST /api/leads/:id/interactions` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| updateInteraction | `PATCH /api/leads/:id/interactions/:interactionId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| deleteInteraction | `DELETE /api/leads/:id/interactions/:interactionId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| addReminder | `POST /api/leads/:id/reminders` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| completeReminder | `PATCH /api/leads/reminders/:reminderId/complete` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getLeadSequences | `GET /api/leads/:id/sequences` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getPurchaseHistory | `GET /api/leads/:id/purchase-history` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| sendLeadEmail | `POST /api/leads/:id/send-email` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listLeadEmails | `GET /api/leads/:id/emails` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| reassign | `PATCH /api/leads/:id/reassign` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| reportSpam | `POST /api/leads/:id/report-spam` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| softDelete | `DELETE /api/leads/:id` | sesión · rol (admin, superadmin) +soporte o permiso leads.delete | superadmin, admin, soporte y quien tenga el permiso por rol a medida o excepción |
| restore | `PATCH /api/leads/:id/restore` | sesión · roleGuard(superadmin) +superadmin +soporte por el atajo | superadmin, soporte |
| reassignPending | `POST /api/leads/reassign-pending` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| softDelete · borrar por cualquier motivo, aunque no sea suyo o tenga ventas | `DELETE /api/leads/:id` | cuando borrar por cualquier motivo, aunque no sea suyo o tenga ventas: a mano, lead.controller.js · softDelete | superadmin, admin, soporte |

## make

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| list | `GET /api/make-webhooks/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getById | `GET /api/make-webhooks/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| create | `POST /api/make-webhooks/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| update | `PATCH /api/make-webhooks/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| remove | `DELETE /api/make-webhooks/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| rotateSecret | `POST /api/make-webhooks/:id/rotate-secret` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| deliveries | `GET /api/make-webhooks/:id/deliveries` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| receive | `POST /api/webhooks/make/:slug` | nada (pública) | cualquiera, sin sesión |

## matriculas

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| getDoc | `GET /api/matriculas/:id/doc/:tipo` | nada (pública) | cualquiera, sin sesión |
| list | `GET /api/matriculas/` | sesión · roleGuard(admin, superadmin, gestor) +superadmin +soporte por el atajo | superadmin, admin, gestor, soporte |
| getById | `GET /api/matriculas/:id` | sesión · roleGuard(admin, superadmin, gestor) +superadmin +soporte por el atajo | superadmin, admin, gestor, soporte |
| create | `POST /api/matriculas/` | sesión · roleGuard(admin, superadmin, gestor) +superadmin +soporte por el atajo | superadmin, admin, gestor, soporte |
| update | `PATCH /api/matriculas/:id` | sesión · roleGuard(admin, superadmin, gestor) +superadmin +soporte por el atajo | superadmin, admin, gestor, soporte |
| remove | `DELETE /api/matriculas/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| setEstado | `POST /api/matriculas/:id/estado` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| uploadDoc | `POST /api/matriculas/:id/doc/:tipo` | sesión · roleGuard(admin, superadmin, gestor) +superadmin +soporte por el atajo | superadmin, admin, gestor, soporte |

## mcp

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| estado | `GET /api/mcp/panel/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| crearToken | `POST /api/mcp/panel/tokens` | sesión · a mano: mcp.acceso.js · puedeUsarMcp | superadmin, admin y gestor/soporte/project_manager con «usa_mcp» |
| revocarToken | `DELETE /api/mcp/panel/tokens/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| crearCodigo | `POST /api/mcp/panel/codigo` | sesión · a mano: mcp.acceso.js · puedeUsarMcp | superadmin, admin y gestor/soporte/project_manager con «usa_mcp» |
| desbloquearUrl | `POST /api/mcp/panel/tokens/:id/desbloquear` | sesión · a mano: mcp.acceso.js · puedeUsarMcp | superadmin, admin y gestor/soporte/project_manager con «usa_mcp» |
| decidirConexion | `PATCH /api/mcp/panel/conexiones/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| personas | `GET /api/mcp/panel/personas` | sesión · soloRoles(superadmin, admin) | superadmin, admin |
| cambiarAcceso | `PATCH /api/mcp/panel/personas/:id` | sesión · soloRoles(superadmin, admin) | superadmin, admin |
| actividad | `GET /api/mcp/panel/actividad` | sesión · soloRoles(superadmin, admin) | superadmin, admin |
| interruptor | `POST /api/mcp/panel/interruptor` | sesión · soloRoles(superadmin) | superadmin |
| (anónima) | `GET /api/mcp/oauth/recurso/mcp/u/:secreto` | nada (pública) | cualquiera, sin sesión |
| (anónima) | `GET /api/mcp/oauth/metadatos` | nada (pública) | cualquiera, sin sesión |
| (anónima) | `GET /api/mcp/oauth/.well-known/oauth-authorization-server` | nada (pública) | cualquiera, sin sesión |
| (anónima) | `GET /api/mcp/oauth/.well-known/openid-configuration` | nada (pública) | cualquiera, sin sesión |
| (anónima) | `POST /api/mcp/oauth/register` | nada (pública) | cualquiera, sin sesión |
| (anónima) | `GET /api/mcp/oauth/authorize` | nada (pública) | cualquiera, sin sesión |
| (anónima) | `POST /api/mcp/oauth/token` | nada (pública) | cualquiera, sin sesión |
| atenderPeticion | `POST /api/mcp/` | a mano: mcp.acceso.js · puedeUsarMcp | cualquiera, sin sesión |
| metodoNoPermitido | `GET /api/mcp/` | nada (pública) | cualquiera, sin sesión |
| metodoNoPermitido | `DELETE /api/mcp/` | nada (pública) | cualquiera, sin sesión |
| atenderPeticion | `POST /api/mcp/u/:secreto` | a mano: mcp.acceso.js · puedeUsarMcp | cualquiera, sin sesión |
| metodoNoPermitido | `GET /api/mcp/u/:secreto` | nada (pública) | cualquiera, sin sesión |
| metodoNoPermitido | `DELETE /api/mcp/u/:secreto` | nada (pública) | cualquiera, sin sesión |
| decidirConexion · rechazar un Claude conectado a la URL de otra persona | `PATCH /api/mcp/panel/conexiones/:id` | cuando rechazar un Claude conectado a la URL de otra persona: a mano, mcp.conexiones.js · decidir | superadmin |

## messages

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| listConversations | `GET /api/mensajes/conversations` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| unreadCount | `GET /api/mensajes/conversations/unread-count` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| createConversation | `POST /api/mensajes/conversations` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listMessages | `GET /api/mensajes/conversations/:id/messages` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| sendMessage | `POST /api/mensajes/conversations/:id/messages` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| markRead | `PATCH /api/mensajes/conversations/:id/read` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| typing | `POST /api/mensajes/conversations/:id/typing` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getTyping | `GET /api/mensajes/conversations/:id/typing` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| deleteMessage | `DELETE /api/mensajes/messages/:msgId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| availableUsers | `GET /api/mensajes/users/available` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| onlineUsers | `GET /api/mensajes/users/online` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |

## meta-ads

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| listAccounts | `GET /api/meta-ads/accounts` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getAccount | `GET /api/meta-ads/account` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| connect | `POST /api/meta-ads/connect` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| updateToken | `PATCH /api/meta-ads/accounts/:accountId/token` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| disconnect | `DELETE /api/meta-ads/accounts/:accountId` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| syncNow | `POST /api/meta-ads/accounts/:accountId/sync` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| backfill | `POST /api/meta-ads/accounts/:accountId/backfill` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| listCampaigns | `GET /api/meta-ads/campaigns` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| campaignDetail | `GET /api/meta-ads/campaigns/:campaignId` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| listAdSets | `GET /api/meta-ads/campaigns/:campaignId/adsets` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| listAds | `GET /api/meta-ads/adsets/:adsetId/ads` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| dashboard | `GET /api/meta-ads/dashboard` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| listAssociations | `GET /api/meta-ads/associations` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| setAssociations | `POST /api/meta-ads/associations` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| listAdSetAssociations | `GET /api/meta-ads/adset-associations` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| setAdSetAssociations | `POST /api/meta-ads/adset-associations` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getRoi | `GET /api/meta-ads/roi` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getProductsView | `GET /api/meta-ads/products-view` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## notifications

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| list | `GET /api/notifications/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| unreadCount | `GET /api/notifications/unread-count` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| getPreferences | `GET /api/notifications/preferences` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| putPreferences | `PUT /api/notifications/preferences` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| markReadGroup | `PATCH /api/notifications/read-group` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| markRead | `PATCH /api/notifications/:id/read` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| markAllRead | `PATCH /api/notifications/mark-all-read` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |

## novedades

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| listar | `GET /api/novedades/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| pdf | `GET /api/novedades/:version/pdf` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| envios | `GET /api/novedades/:version/envios` | sesión · roleGuard(superadmin, soporte, admin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| enviar | `POST /api/novedades/:version/enviar` | sesión · roleGuard(superadmin, soporte) +superadmin +soporte por el atajo | superadmin, soporte |

## payroll

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| listPlans | `GET /api/payroll/plans` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| upsertPlan | `PUT /api/payroll/plans` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| deletePlan | `DELETE /api/payroll/plans/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| listHours | `GET /api/payroll/hours` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| createHours | `POST /api/payroll/hours` | sesión · roleGuard(admin, superadmin, gestor) +superadmin +soporte por el atajo | superadmin, admin, gestor, soporte |
| deleteHours | `DELETE /api/payroll/hours/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| listPeriods | `GET /api/payroll/periods` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getPeriod | `GET /api/payroll/periods/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| generatePeriod | `POST /api/payroll/periods/generate` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| closePeriod | `POST /api/payroll/periods/:id/close` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| payPeriod | `POST /api/payroll/periods/:id/pay` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| addAdjustment | `POST /api/payroll/adjustments` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| deleteAdjustment | `DELETE /api/payroll/adjustments/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## permissions

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| getSystemDefaults | `GET /api/permissions/system-defaults` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listCustomRoles | `GET /api/permissions/custom-roles` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getCustomRole | `GET /api/permissions/custom-roles/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| createCustomRole | `POST /api/permissions/custom-roles` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| updateCustomRole | `PUT /api/permissions/custom-roles/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| deleteCustomRole | `DELETE /api/permissions/custom-roles/:id` | sesión · roleGuard(superadmin) +superadmin +soporte por el atajo | superadmin, soporte |
| getUserPermissions | `GET /api/permissions/users/:userId/permissions` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| saveUserPermissions | `PUT /api/permissions/users/:userId/permissions` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getRolePermissions | `GET /api/permissions/role-permissions/:roleKey` | sesión · soloRoles(superadmin, admin) | superadmin, admin |
| saveRolePermissions | `PUT /api/permissions/role-permissions/:roleKey` | sesión · soloRoles(superadmin, admin) | superadmin, admin |
| getClaveDeRol | `GET /api/permissions/claves/:clave/rol/:roleKey` | sesión · soloRoles(superadmin, admin) | superadmin, admin |
| setClaveDeRol | `PUT /api/permissions/claves/:clave/rol/:roleKey` | sesión · soloRoles(superadmin) | superadmin |
| personasDeLaClave | `GET /api/permissions/claves/:clave/personas` | sesión · soloRoles(superadmin, admin) | superadmin, admin |
| setClaveDePersona | `PUT /api/permissions/claves/:clave/personas/:userId` | sesión · soloRoles(superadmin, admin) | superadmin, admin |
| getRoleView | `GET /api/permissions/role-views/:roleKey` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| setRoleView | `PUT /api/permissions/role-views/:roleKey` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## proceso

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| listarPasos | `GET /api/proceso/pasos` | sesión · ambitoDelProceso (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |
| crearPaso | `POST /api/proceso/pasos` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · ambitoDelProceso (campus) | superadmin, admin, soporte |
| reordenarPasos | `PATCH /api/proceso/pasos/orden` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · ambitoDelProceso (campus) | superadmin, admin, soporte |
| editarPaso | `PATCH /api/proceso/pasos/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · ambitoDelProceso (campus) | superadmin, admin, soporte |
| desactivarPaso | `DELETE /api/proceso/pasos/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · ambitoDelProceso (campus) | superadmin, admin, soporte |
| cola | `GET /api/proceso/cola` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| resumenCola | `GET /api/proceso/cola/resumen` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| seguimiento | `GET /api/proceso/seguimiento` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| resumenSeguimiento | `GET /api/proceso/seguimiento/resumen` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| wasapiSeguimiento | `GET /api/proceso/seguimiento/wasapi` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| pasosDeUnLead | `GET /api/proceso/lead/:leadId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| replanificar | `POST /api/proceso/lead/:leadId/replanificar` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| ajustarPasoDeLead | `PATCH /api/proceso/paso-lead/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| anadirSeguimientoDeLead | `POST /api/proceso/lead/:leadId/seguimiento` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |

## product-categories

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| getTree | `GET /api/product-categories/tree` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listByProject | `GET /api/product-categories/project/:projectId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getAncestors | `GET /api/product-categories/:id/ancestors` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| create | `POST /api/product-categories/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| update | `PATCH /api/product-categories/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| remove | `DELETE /api/product-categories/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## products

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| list | `GET /api/products/` | sesión · projectAccess (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |
| exportAll | `GET /api/products/export` | sesión · projectAccess (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |
| leadsStats | `GET /api/products/leads-stats` | sesión · projectAccess (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |
| getById | `GET /api/products/:id` | sesión · projectAccess (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |
| getImageUrl | `GET /api/products/:id/image-url` | sesión · projectAccess (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |
| create | `POST /api/products/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| update | `PATCH /api/products/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| deactivate | `DELETE /api/products/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| uploadImage | `POST /api/products/:id/image` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| removeImage | `DELETE /api/products/:id/image` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| listModules | `GET /api/products/:id/modules` | sesión · projectAccess (campus) | superadmin, admin, gestor, soporte, project_manager, tutor |
| createModule | `POST /api/products/:id/modules` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| updateModule | `PATCH /api/products/:id/modules/:moduleId` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| deleteModule | `DELETE /api/products/:id/modules/:moduleId` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |
| reorderModules | `POST /api/products/:id/modules/reorder` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · projectAccess (campus) | superadmin, admin, soporte |

## project-channels

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| list | `GET /api/project-channels/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| create | `POST /api/project-channels/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| update | `PATCH /api/project-channels/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| remove | `DELETE /api/project-channels/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## projects

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| getLogo | `GET /api/projects/:id/logo` | nada (pública) | cualquiera, sin sesión |
| getCatalog | `GET /api/projects/shortcuts/catalog` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| types | `GET /api/projects/types` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| listSociedades | `GET /api/projects/sociedades` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| createSociedad | `POST /api/projects/sociedades` | sesión · roleGuard(superadmin) +superadmin +soporte por el atajo | superadmin, soporte |
| list | `GET /api/projects/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getById | `GET /api/projects/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| create | `POST /api/projects/` | sesión · roleGuard(superadmin) +superadmin +soporte por el atajo | superadmin, soporte |
| update | `PATCH /api/projects/:id` | sesión · roleGuard(superadmin) +superadmin +soporte por el atajo | superadmin, soporte |
| regenerateKey | `POST /api/projects/:id/regenerate-webhook-key` | sesión · roleGuard(superadmin) +superadmin +soporte por el atajo | superadmin, soporte |
| uploadLogo | `POST /api/projects/:id/logo` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| deleteLogo | `DELETE /api/projects/:id/logo` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| saveShortcuts | `PUT /api/projects/:id/shortcuts` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getUltimoLead | `GET /api/projects/:id/ultimo-lead` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getQueueState | `GET /api/projects/:id/queue-state` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |

## registro

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| listar | `GET /api/registro/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| fuentes | `GET /api/registro/fuentes` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| csv | `GET /api/registro/csv` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## reports

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| overview | `GET /api/informes/overview` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| (anónima) | `GET /api/informes/resumen-mensual` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| (anónima) | `GET /api/informes/prospectos` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| (anónima) | `GET /api/informes/ventas` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| (anónima) | `GET /api/informes/general` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| (anónima) | `GET /api/informes/general-facturacion` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| (anónima) | `GET /api/informes/cobros-mensuales` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| (anónima) | `GET /api/informes/ventas-vendedora` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| ventasAsesora | `GET /api/informes/ventas-asesora` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| asesorasMes | `GET /api/informes/asesoras-mes` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| miPuesto | `GET /api/informes/mi-puesto` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| panel | `GET /api/informes/panel` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| seguimiento | `GET /api/informes/seguimiento` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| paises | `GET /api/informes/paises` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| formaciones | `GET /api/informes/formaciones` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| detalle | `GET /api/informes/detalle` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| avisoSinFactura | `GET /api/informes/aviso-sin-factura` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| tasaCierre | `GET /api/informes/tasa-cierre` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| tasaCierreDetalle | `GET /api/informes/tasa-cierre/detalle` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| resumenDia | `GET /api/informes/resumen-del-dia` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| miPuesto · ver el puesto de otra gestora (gestoraId) | `GET /api/informes/mi-puesto` | cuando ver el puesto de otra gestora (gestoraId): a mano, report.controller.js · miPuesto | superadmin, admin, soporte |

## reports-ia

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| list | `GET /api/reports-ia/:projectId` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getDetail | `GET /api/reports-ia/detail/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| generate | `POST /api/reports-ia/:projectId/generate` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| exportPdf | `POST /api/reports-ia/:id/export-pdf` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## sales

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| create | `POST /api/ventas/` | sesión · roleGuard(gestor, admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, gestor, soporte |
| resumenVentas | `GET /api/ventas/resumen` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| ventasPorAsesora | `GET /api/ventas/por-asesora` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| ventasPorCliente | `GET /api/ventas/por-cliente` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| topProducts | `GET /api/ventas/top-products` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| facturado | `GET /api/ventas/facturado` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| gestoresStats | `GET /api/ventas/gestores-stats` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| desglose | `GET /api/ventas/desglose` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| paises | `GET /api/ventas/paises` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| serieVentas | `GET /api/ventas/serie` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| myStats | `GET /api/ventas/my-stats` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| setGoal | `POST /api/ventas/goals` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| deleteGoal | `DELETE /api/ventas/goals/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| create · registrar una venta que no es de nadie («sin gestora») | `POST /api/ventas/` | cuando registrar una venta que no es de nadie («sin gestora»): a mano, sales.controller.js · resolvePermission(conversions.sin_gestora) | superadmin, admin |

## status

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| getStatus | `GET /api/status/` | nada (pública) | cualquiera, sin sesión |
| getIncidents | `GET /api/status/incidents` | nada (pública) | cualquiera, sin sesión |
| createIncident | `POST /api/status/incidents` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| updateIncident | `PUT /api/status/incidents/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| updateComponent | `PUT /api/status/components/:slug` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getErrors | `GET /api/status/errors` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getPiezas | `GET /api/status/piezas` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getCorreos | `GET /api/status/correos` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getVistaPreviaCorreos | `GET /api/status/correos/vista-previa` | sesión · roleGuard(soporte, superadmin) +superadmin +soporte por el atajo | superadmin, soporte |

## stripe-payments

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| list | `GET /api/stripe-payments/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| stats | `GET /api/stripe-payments/stats` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| sync | `POST /api/stripe-payments/sync` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getOne | `GET /api/stripe-payments/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| link | `POST /api/stripe-payments/:id/link` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| unlink | `DELETE /api/stripe-payments/:id/link` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| updateDispute | `PATCH /api/stripe-payments/:id/dispute` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| webhook | `POST /api/stripe-webhook/:projectId` | nada (pública) | cualquiera, sin sesión |

## tasks

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| (anónima) | `GET /api/tasks/metrics` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `GET /api/tasks/metrics/areas` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `GET /api/tasks/assignees` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `GET /api/tasks/tags` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `GET /api/tasks/review` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `GET /api/tasks/review/count` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `GET /api/tasks/columns` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `POST /api/tasks/columns` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `PATCH /api/tasks/columns/reorder` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `PATCH /api/tasks/columns/:id` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `DELETE /api/tasks/columns/:id` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `GET /api/tasks/areas` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `POST /api/tasks/areas` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `GET /api/tasks/areas/assignments` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `GET /api/tasks/areas/user/:userId` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `PUT /api/tasks/areas/user/:userId` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `PATCH /api/tasks/areas/:id` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `PUT /api/tasks/areas/:id/members` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `GET /api/tasks/external-projects` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `POST /api/tasks/external-projects` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `PATCH /api/tasks/external-projects/:id` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `GET /api/tasks/` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `POST /api/tasks/` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `GET /api/tasks/:id` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `PATCH /api/tasks/:id/move` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `PATCH /api/tasks/:id/return` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `PATCH /api/tasks/:id/approve` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `PATCH /api/tasks/:id` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `DELETE /api/tasks/:id` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `POST /api/tasks/:id/checklist` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `PATCH /api/tasks/:id/checklist/:itemId` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `DELETE /api/tasks/:id/checklist/:itemId` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `POST /api/tasks/:id/comments` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `DELETE /api/tasks/:id/comments/:commentId` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `POST /api/tasks/:id/tags` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `DELETE /api/tasks/:id/tags/:tagId` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `POST /api/tasks/:id/links` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |
| (anónima) | `DELETE /api/tasks/:id/links/:linkId` | sesión · soloRoles(superadmin, admin, colaborador) | superadmin, admin, colaborador |

## tutores

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| colaboraciones | `GET /api/tutores/colaboraciones` | sesión · a mano: tutor.controller.js · esTutor \|\| exigirGestion | superadmin, admin, tutor y gestor/soporte/project_manager con «gestor_colaboraciones» |
| crearColaboracion | `POST /api/tutores/colaboraciones` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| editarColaboracion | `PATCH /api/tutores/colaboraciones/:id` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| borrarColaboracion | `DELETE /api/tutores/colaboraciones/:id` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| ajustes | `GET /api/tutores/ajustes` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| guardarAjustes | `PATCH /api/tutores/ajustes` | sesión · a mano: tutor.controller.js | superadmin, admin |
| simulacion | `GET /api/tutores/simulacion` | sesión · a mano: tutor.controller.js · esTutor \|\| exigirGestion | superadmin, admin, tutor y gestor/soporte/project_manager con «gestor_colaboraciones» |
| calcular | `POST /api/tutores/comisiones/calcular` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| resumenComisiones | `GET /api/tutores/comisiones/resumen` | sesión · a mano: tutor.controller.js · esTutor \|\| exigirGestion | superadmin, admin, tutor y gestor/soporte/project_manager con «gestor_colaboraciones» |
| listarComisiones | `GET /api/tutores/comisiones` | sesión · a mano: tutor.controller.js · esTutor \|\| exigirGestion | superadmin, admin, tutor y gestor/soporte/project_manager con «gestor_colaboraciones» |
| liquidar | `POST /api/tutores/comisiones/liquidar` | sesión · a mano: tutor.controller.js | superadmin, admin |
| revertirComision | `POST /api/tutores/comisiones/:id/revertir` | sesión · a mano: tutor.controller.js | superadmin, admin |
| cambiarEstadoComision | `PATCH /api/tutores/comisiones/:id/estado` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| previoDelAviso | `GET /api/tutores/comisiones/aviso` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| avisarTutor | `POST /api/tutores/comisiones/avisar` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| formacionesSinTutor | `GET /api/tutores/formaciones-sin-tutor` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| pagosSinFormacion | `GET /api/tutores/pagos-sin-formacion` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| marcarBusqueda | `PUT /api/tutores/formaciones/:productId/busqueda` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| anunciosDeTutores | `GET /api/tutores/anuncios` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| cursoDetalle | `GET /api/tutores/curso/:productId` | sesión · a mano: tutor.controller.js · esTutor \|\| exigirGestion | superadmin, admin, tutor y gestor/soporte/project_manager con «gestor_colaboraciones» |
| brochureDelCurso | `GET /api/tutores/curso/:productId/brochure` | sesión · a mano: tutor.controller.js · esTutor \|\| exigirGestion | superadmin, admin, tutor y gestor/soporte/project_manager con «gestor_colaboraciones» |
| listar | `GET /api/tutores/` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| alta | `POST /api/tutores/` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| ficha | `GET /api/tutores/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| guardarPerfil | `PATCH /api/tutores/:id/perfil` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| cambiarCobraDesde | `PATCH /api/tutores/:id/cobra-desde` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| cambiarContrasena | `POST /api/tutores/:id/contrasena` | sesión · a mano: tutor.controller.js | superadmin, admin |
| reactivarTutor | `POST /api/tutores/:id/reactivar` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| retirarTutor | `DELETE /api/tutores/:id` | sesión · a mano: tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| ficha · la ficha de otro tutor (la suya, el tutor siempre) | `GET /api/tutores/:id` | cuando la ficha de otro tutor (la suya, el tutor siempre): a mano, tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| guardarPerfil · la ficha de otro tutor (la suya, el tutor siempre) | `PATCH /api/tutores/:id/perfil` | cuando la ficha de otro tutor (la suya, el tutor siempre): a mano, tutor.controller.js · exigirGestion | superadmin, admin y gestor/soporte/project_manager/tutor con «gestor_colaboraciones» |
| guardarPerfil · cambiar el correo del tutor | `PATCH /api/tutores/:id/perfil` | cuando cambiar el correo del tutor: a mano, tutor.controller.js · guardarPerfil | superadmin |

## users

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| getAvatar | `GET /api/users/:id/avatar` | nada (pública) | cualquiera, sin sesión |
| uploadAvatar | `POST /api/users/:id/avatar` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| deleteAvatar | `DELETE /api/users/:id/avatar` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| getViews | `GET /api/users/:id/views` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| setViews | `PATCH /api/users/:id/views` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| misAvisos | `GET /api/users/mis-avisos` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| cambiarMiAviso | `PATCH /api/users/mis-avisos` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor, colaborador |
| list | `GET /api/users/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| listAvailability | `GET /api/users/availability` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| deleteBlock | `DELETE /api/users/availability-blocks/:blockId` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getById | `GET /api/users/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| create | `POST /api/users/` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| update | `PATCH /api/users/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| deactivate | `DELETE /api/users/:id` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| reactivate | `PATCH /api/users/:id/reactivate` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| setPassword | `PATCH /api/users/:id/password` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · a mano: user.controller.js · setPassword | superadmin, admin |
| avisoCorreo | `GET /api/users/:id/aviso-correo` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo · soloRoles(superadmin) | superadmin |
| setAvailability | `PATCH /api/users/:id/availability` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| listBlocks | `GET /api/users/:id/availability-blocks` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| createBlock | `POST /api/users/:id/availability-blocks` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| create · dar empresas enteras a un admin, o cambiar el correo de alguien | `POST /api/users/` | cuando dar empresas enteras a un admin, o cambiar el correo de alguien: a mano, user.controller.js · create/update | superadmin |
| update · dar empresas enteras a un admin, o cambiar el correo de alguien | `PATCH /api/users/:id` | cuando dar empresas enteras a un admin, o cambiar el correo de alguien: a mano, user.controller.js · create/update | superadmin |

## webhook-tokens

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| publicReceive | `POST /api/webhook-tokens/receive/:token` | nada (pública) | cualquiera, sin sesión |
| list | `GET /api/webhook-tokens/` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| getStatus | `GET /api/webhook-tokens/:id/status` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| create | `POST /api/webhook-tokens/` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| update | `PATCH /api/webhook-tokens/:id` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| remove | `DELETE /api/webhook-tokens/:id` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| startListening | `POST /api/webhook-tokens/:id/listen` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| stopListening | `POST /api/webhook-tokens/:id/listen/stop` | sesión · roleGuard(admin, superadmin, soporte) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## webhooks-salientes

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| listar | `GET /api/webhooks-salientes/` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| ejemplo | `GET /api/webhooks-salientes/ejemplo` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| envios | `GET /api/webhooks-salientes/envios` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| reenviar | `POST /api/webhooks-salientes/envios/:envioId/reenviar` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| uno | `GET /api/webhooks-salientes/:id` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| crear | `POST /api/webhooks-salientes/` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| cambiar | `PATCH /api/webhooks-salientes/:id` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| borrar | `DELETE /api/webhooks-salientes/:id` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| prueba | `POST /api/webhooks-salientes/:id/prueba` | sesión · soloRoles(admin, superadmin) | superadmin, admin |
| crear · webhooks para todas las empresas | `POST /api/webhooks-salientes/` | cuando webhooks para todas las empresas: a mano, webhooks-salientes.controller.js · esSuperadmin | superadmin |
| cambiar · webhooks para todas las empresas | `PATCH /api/webhooks-salientes/:id` | cuando webhooks para todas las empresas: a mano, webhooks-salientes.controller.js · esSuperadmin | superadmin |

## whatsapp

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| webhook | `POST /api/whatsapp/webhook` | nada (pública) | cualquiera, sin sesión |
| verMedia | `GET /api/whatsapp/media/:mensajeId` | nada (pública) | cualquiera, sin sesión |
| listTemplates | `GET /api/whatsapp/templates` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| createTemplate | `POST /api/whatsapp/templates` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| updateTemplate | `PATCH /api/whatsapp/templates/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| deleteTemplate | `DELETE /api/whatsapp/templates/:id` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| cola | `GET /api/whatsapp/cola` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| usuarios | `GET /api/whatsapp/usuarios` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| formaDeAvisos | `GET /api/whatsapp/forma-avisos` | sesión · soloRoles(soporte, superadmin) | superadmin, soporte |
| olvidarFormaDeAvisos | `DELETE /api/whatsapp/forma-avisos` | sesión · soloRoles(soporte, superadmin) | superadmin, soporte |
| banco | `GET /api/whatsapp/banco` | sesión · a mano: chat.controller.js · sesionesQuePuedeMirar | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| bancoNumeros | `GET /api/whatsapp/banco/numeros` | sesión · a mano: chat.controller.js · sesionesQuePuedeMirar | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| etiquetasDeWhatsapp | `GET /api/whatsapp/etiquetas` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| chats | `GET /api/whatsapp/chats` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| abrirChat | `POST /api/whatsapp/chats` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| chat | `GET /api/whatsapp/chats/:id` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| ficha | `GET /api/whatsapp/chats/:id/ficha` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| enviar | `POST /api/whatsapp/chats/:id/enviar` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| adjunto | `POST /api/whatsapp/chats/:id/adjunto` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| traerHistorial | `POST /api/whatsapp/chats/:id/historial` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| reenviar | `POST /api/whatsapp/chats/:id/reenviar` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| noEscribir | `POST /api/whatsapp/chats/:id/no-escribir` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| etiquetarChat | `POST /api/whatsapp/chats/:id/etiqueta` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| registrarLlamada | `POST /api/whatsapp/chats/:id/llamada` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| descargarAdjunto | `POST /api/whatsapp/mensajes/:id/descargar` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| editarMensaje | `PATCH /api/whatsapp/mensajes/:id` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| conexion | `GET /api/whatsapp/conexion` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| sincronizacion | `GET /api/whatsapp/sincronizacion` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| reintentarArchivos | `POST /api/whatsapp/reintentar-archivos` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| emparejar | `POST /api/whatsapp/emparejar` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| desconectar | `POST /api/whatsapp/desconectar` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| sonando | `GET /api/whatsapp/sonando` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| sinLeer | `GET /api/whatsapp/sin-leer` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| respuestaLlamada | `GET /api/whatsapp/respuesta-llamada` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| guardarRespuestaLlamada | `POST /api/whatsapp/respuesta-llamada` | sesión · a mano: chat.controller.js · usuarioObjetivo (rol con WhatsApp + casilla usa_whatsapp) | superadmin, admin, gestor, soporte (salvo con «usa_whatsapp» apagado) |
| chats · trabajar sobre la sesión de otra persona | `GET /api/whatsapp/chats` | cuando trabajar sobre la sesión de otra persona: a mano, chat.controller.js · usuarioObjetivo (usuarioId ajeno) | superadmin, admin |
| chat · trabajar sobre la sesión de otra persona | `GET /api/whatsapp/chats/:id` | cuando trabajar sobre la sesión de otra persona: a mano, chat.controller.js · usuarioObjetivo (usuarioId ajeno) | superadmin, admin |
| enviar · trabajar sobre la sesión de otra persona | `POST /api/whatsapp/chats/:id/enviar` | cuando trabajar sobre la sesión de otra persona: a mano, chat.controller.js · usuarioObjetivo (usuarioId ajeno) | superadmin, admin |
| createTemplate · plantillas compartidas o de otra persona | `POST /api/whatsapp/templates` | cuando plantillas compartidas o de otra persona: a mano, whatsapp.controller.js · createTemplate/permitida | superadmin, admin, soporte |
| updateTemplate · plantillas compartidas o de otra persona | `PATCH /api/whatsapp/templates/:id` | cuando plantillas compartidas o de otra persona: a mano, whatsapp.controller.js · createTemplate/permitida | superadmin, admin, soporte |
| deleteTemplate · plantillas compartidas o de otra persona | `DELETE /api/whatsapp/templates/:id` | cuando plantillas compartidas o de otra persona: a mano, whatsapp.controller.js · createTemplate/permitida | superadmin, admin, soporte |

## widget

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| getConfig | `GET /api/widget/config` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| updateConfig | `PATCH /api/widget/config` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| updateUserPhone | `PATCH /api/widget/users/:userId/phone` | sesión | superadmin, admin, gestor, soporte, project_manager, tutor |
| widgetScript | `GET /api/w/whatsapp/:projectIdJs` | nada (pública) | cualquiera, sin sesión |
| widgetData | `GET /api/w/data/:projectIdJson` | nada (pública) | cualquiera, sin sesión |

## woocommerce

| Acción | Método y ruta | Qué la protege hoy | Quién puede de verdad |
|---|---|---|---|
| getCreds | `GET /api/woocommerce/credentials` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| upsertCreds | `PUT /api/woocommerce/credentials` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| deleteCreds | `DELETE /api/woocommerce/credentials` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| listMappings | `GET /api/woocommerce/mappings` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| setMappings | `PUT /api/woocommerce/mappings` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| listRuns | `GET /api/woocommerce/runs` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| getCurrentRun | `GET /api/woocommerce/runs/current` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| importNow | `POST /api/woocommerce/runs/start` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| autoDiscoverCpts | `POST /api/woocommerce/auto-discover-cpts` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| previewWc | `GET /api/woocommerce/preview` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| saveMapping | `PUT /api/woocommerce/mapping` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |
| scrapePreview | `POST /api/woocommerce/scrape-preview` | sesión · roleGuard(admin, superadmin) +superadmin +soporte por el atajo | superadmin, admin, soporte |

## Dentro del código, que ya preguntan a un permiso

| Módulo | Dónde | Qué decide |
|---|---|---|
| tasks | tasks.service.js · permisosDe (buildPermissionsMap) | cada acción del tablero mira su clave tasks.* (ver todo, ver lo suyo, crear, asignar, editar, borrar, aprobar, configurar) |

## Alcance: sobre qué datos (no son permisos)

| Módulo | Dónde | Qué decide |
|---|---|---|
| leads | lead.controller.js · list, quickCounts, revisar, stats, exportWasapi, exigirQueSeaSuyo | la gestora solo ve y toca sus prospectos (responsable) |
| leads | lead.service.js · updateInteraction/deleteInteraction | la gestora solo edita sus propias interacciones |
| conversions | conversion.controller.js · list, cuotas, filas, removePayment, remove, listProductos | la gestora solo ve y toca sus ventas |
| sales | sales.controller.js · topProducts, facturado, desglose | la gestora solo cuenta sus ventas |
| sales | sales.goals.js · setGoal/deleteGoal | la gestora solo pone y borra su propia meta |
| accounting | accounting.controller.js · receivable | la gestora solo ve lo suyo |
| invoices | invoices.controller.js · list | la gestora solo ve sus facturas; filtrar por empresa, solo admin |
| feedback | feedback.controller.js · exigirQueSeaSuyo | la gestora solo toca el correo de sus prospectos |
| whatsapp | whatsapp.controller.js · cola; chat.controller.js · usuarios | la gestora, su cola y su sesión |
| proceso | proceso.controller.js · deQuienEsLaCola; proceso.ambito.js | de quién es la cola y qué campus entran |
| notifications | notifications.service.js · visibilityClause | qué avisos ve cada uno |
| (todo el CRM) | shared/utils/ambito.js · veTodoElCrm, proyectosDelAmbito; projectAccess | superadmin y soporte ven todos los campus; el resto, los suyos |
| users | user.controller.js · uploadAvatar/deleteAvatar; user.views.controller.js · canEdit | cada uno su foto y su vista; el superadmin, la de cualquiera |
| mcp | mcp.controller.js · cambiarAcceso; mcp.model.js · listarPersonas | el admin, solo personas de sus campus |
| expenses | expense.service.js | gastos de los campus de cada uno |
| certifex | certifex.alcance.js | diplomas de los campus de cada uno |
| tutores | tutor.controller.js · exigirTutorDeMisCampus | fichas de tutores de sus campus |
| facturas-colaborador | facturas-colaborador.service.js · ambitoDe | facturas de las empresas de sus campus |
