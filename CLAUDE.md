# CRM MultiProyecto — Guia de Desarrollo

## Descripcion
CRM interno multi-proyecto para gestion de leads, conversiones, campanas publicitarias y monitorizacion de ingresos. Proyectos educativos (Psiko Aprende, ISEIH, Fono Aprende) y plataformas IA (Psicologo IA, Nutricionista IA, Tarot IA).

## Stack
- **Frontend:** React 18 + Vite + shadcn/ui (Radix + Tailwind) — SPA servida desde /crm en Nginx
- **Backend:** Node.js + Express — API REST en puerto 3001, proxy reverso Nginx
- **Base de datos:** PostgreSQL — Relacional, multi-proyecto con FK en todas las entidades
- **Servidor:** VPS Hostinger (KVM) — Nginx + PM2 + Let's Encrypt (HTTPS)
- **Storage:** Cloudflare R2 — Compatible S3, dossiers PDF
- **Email:** Brevo — Notificaciones leads + bienvenida usuarios
- **APIs externas:** Meta Marketing API v19+, Google Ads API v16+, GSC API, Stripe, Claude AI

## Estructura del repositorio (modular)

Arquitectura por modulos: cada dominio (products, dossiers, leads, auth...) contiene todo su codigo (routes, controller, service, model, validation). Codigo compartido en `shared/`.

```
backend/
  src/
    modules/              # Un directorio por dominio de negocio
                          # Hay 46. Los cinco de abajo son un EJEMPLO de la
                          # forma, no la lista: `ls backend/src/modules`.
      auth/               # Diego: login, logout, refresh, set-password
        index.js          # Exporta { prefix, router }
      users/              # Diego: CRUD usuarios, bienvenida Brevo
        index.js
      leads/              # Diego: webhook, round-robin, UTMs
        index.js
      products/           # Angel: CRUD productos por proyecto
        index.js
        product.routes.js
        product.controller.js
        product.service.js
        product.model.js
        product.validation.js
      dossiers/           # Angel: upload PDF, pre-signed URL, historial
        index.js
        dossier.routes.js
        dossier.controller.js
        dossier.service.js
        dossier.model.js
        dossier.validation.js
    shared/               # Codigo compartido entre modulos
      config/             # db.js (pg pool), r2.js (S3 client)
      middleware/         # auth.js, roleGuard, projectAccess, errorHandler, upload
      services/           # r2.service.js (upload/delete R2)
      utils/              # AppError.js, logger.js, presignedUrl.js
    jobs/                 # Cron jobs: reminders, metaSync, googleSync
    app.js                # Express setup + registro automatico de modulos
  migrations/             # SQL secuencial: 001_initial_schema.sql, ...
  seeds/                  # Seed data SQL
  tests/                  # Tests con Vitest
  ecosystem.config.js     # PM2
  package.json
  .env.example

frontend/
  src/
    modules/              # Un directorio por feature/dominio
      products/           # Angel: panel productos + dossiers
        api/              # products.api.js, dossiers.api.js
        hooks/            # useProducts.js, useDossiers.js
        components/       # DossierPanel.jsx
        pages/            # ProductsPage.jsx, ProductDetailPage.jsx
      leads/              # Diego (placeholder)
      auth/               # Diego (placeholder)
    shared/               # Codigo compartido entre modulos
      api/                # client.js (axios instance + interceptors)
      components/
        ui/               # Primitivas shadcn/ui (Button, Input, Dialog, Table, ...)
        layout/           # AppLayout, Sidebar, Navbar, ProjectSelector
      hooks/              # useProject.js, useAuth.js
      lib/                # cn(), constantes, formateadores
      pages/              # LoginPage, DashboardPage (compartidas)
    contexts/             # AuthContext, ProjectContext
    App.jsx               # Router principal — importa pages de cada modulo
    main.jsx
    index.css
  tailwind.config.js
  vite.config.js
  package.json

docs/       # Documentacion tecnica en Markdown
nginx/      # Template configuracion Nginx
scripts/    # backup.sh, deploy.sh
```

### Como crear un nuevo modulo (backend)
1. Crear directorio `backend/src/modules/<nombre>/`
2. Crear archivos: `<nombre>.routes.js`, `<nombre>.controller.js`, `<nombre>.service.js`, `<nombre>.model.js`, `<nombre>.validation.js`
3. Crear `index.js` que exporte `{ prefix: '/api/<nombre>', router }`
4. Importar y registrar en `app.js` (array `modules`)

### Como crear un nuevo modulo (frontend)
1. Crear directorio `frontend/src/modules/<nombre>/`
2. Subdirectorios: `api/`, `hooks/`, `components/`, `pages/`
3. Importar pages con lazy() en `App.jsx` y anadir rutas
4. Imports internos del modulo: relativos (`../hooks/useX`)
5. Imports compartidos: alias (`@/shared/components/ui/button`)

## Convenciones de codigo

### Backend (Node.js)
- JavaScript ES modules (`import`/`export`), NO TypeScript
- Archivos en **kebab-case**: `lead.service.js`, `auth.controller.js`
- Funciones `async/await`, nunca callbacks
- Queries SQL directas con `pg` pool — **NO ORM** (ni Prisma, ni Sequelize, ni Knex)
- Validacion de input con **Zod** en cada endpoint
- Errores con clase `AppError(message, statusCode)`
- Logger: `pino` con niveles info/warn/error
- Tests con Vitest

### Frontend (React)
- Componentes en **PascalCase**: `LeadCard.jsx`, `DashboardPage.jsx`
- **shadcn/ui** para primitivas (Button, Input, Dialog, Table, Select, Badge)
- **Tailwind CSS** para estilos — nunca CSS modules ni styled-components
- Estado global: **React Context** (AuthContext, ProjectContext) — NO Redux
- Fetching: funciones en `/api/` con axios, llamadas desde hooks custom
- **React Router v6** con lazy loading por pagina
- Graficas con **Recharts**

### General
- **Idioma del codigo:** ingles para variables/funciones, espanol para comentarios si son necesarios
- **Commits en espanol** con prefijos: `feat:`, `fix:`, `refactor:`, `docs:`, `chore:`, `test:`
- **Ramas y entornos:**
  - `main` → **produccion** (https://360crm.tech/crm/, DB `crm_prod_db`, PM2 `crm-api-production` :3001, frontend `/var/www/crm/production/frontend`)
  - `staging` → **QA/testeo** (https://360crm.tech/testeo/, DB `crm_test_db`, PM2 `crm-api-staging` :3002, frontend `/var/www/crm/staging/frontend`)
  - `feat/<nombre-corto>` → features en desarrollo (opcional, sin PRs)
  - Flujo recomendado para cambios grandes: `feat/X` → merge a `staging` → validar QA → merge a `main` → deploy prod
  - **Push directo a `main` está permitido** para fixes y cambios chicos (es el flujo habitual del owner). Para cambios riesgosos (pagos, auth, migraciones DB) pasar primero por `staging`.
  - Ver `docs/09-deploy-y-ramas.md` para procedimiento de deploy completo, rollback, envs y webhooks externos.
- Variables de entorno en `.env` — NUNCA hardcodeadas
- Nunca commit de `.env`, `.env.production`, `node_modules/`, `dist/`
- VPS: Hostinger `187.124.128.126` (DNS `360crm.tech`). HTTPS con Let's Encrypt + renovación auto (`certbot.timer`).
- Backups DB en `/var/backups/crm/*.sql.gz` — hacer pg_dump antes de deploys grandes.

## Reglas de negocio criticas

### Autenticacion
- Contraseñas con **bcrypt cost factor 12**
- JWT access token: **15 minutos** en header `Authorization: Bearer`
- Refresh token: **30 dias** en **httpOnly cookie**
- Middleware chain: `verifyToken` → `roleGuard` → `projectAccess`

### Roles
- **Superadmin**: acceso total, unico que crea/desactiva usuarios
- **Admin**: acceso operativo completo, no gestiona usuarios
- **Gestor**: solo ve proyectos asignados, solo sus leads

### Leads
- **Round-robin** en transaccion PostgreSQL (`BEGIN`/`COMMIT`), nunca fuera
- **Webhook < 500ms**: email de Brevo se envia async, respuesta inmediata al formulario
- **Duplicados**: deteccion por email, siempre crear nuevo registro + vincular con `lead_duplicado_de`
- **Gestores inactivos**: se saltan en round-robin automaticamente

### Archivos
- **Pre-signed URLs**: 15 minutos de expiracion, solo usuarios autenticados
- **Dossiers**: versionados, la anterior se marca inactiva, nunca se borra

### Seguridad
- Credenciales API **encriptadas en DB** (AES-256), configurables desde panel admin
- CORS configurado **por dominio de proyecto**, nunca wildcard
- PostgreSQL **solo acceso local** (nunca expuesto al exterior)

## Formato de respuesta API
```json
// Exito
{ "success": true, "data": { ... }, "pagination": { "total": 100, "page": 1, "limit": 20, "totalPages": 5 } }

// Error
{ "success": false, "error": "Mensaje descriptivo", "code": "ERROR_CODE" }
```

## Comandos utiles
```bash
# Backend - desarrollo
cd backend && npm run dev          # nodemon

# Frontend - desarrollo
cd frontend && npm run dev         # vite dev server

# Migraciones
psql -U crm_user -d crm_db -f backend/migrations/001_initial_schema.sql

# Build produccion
cd frontend && npm run build

# PM2
pm2 start ecosystem.config.js
pm2 logs crm-api
pm2 restart crm-api
```

## Documentacion de referencia

**Los ocho documentos que se listaban aqui (`docs/01-esquema-base-datos.md` …
`docs/09-deploy-y-ramas.md`) NUNCA existieron.** Era el indice planeado al
arrancar el proyecto; solo llego a escribirse el `10-whatsapp.md`. Cada sesion
que empezaba recibia una lista de lecturas falsa, y quien la seguia se
encontraba con ocho 404 o —peor— se creia informado.

Esto es lo que hay de verdad en `docs/`:

- `README.md` — indice del directorio
- `10-whatsapp.md` — el modulo de WhatsApp, que es el mas grande
- `TAREAS-EQUIPO.md` — reparto de trabajo y estado
- `ESTADO-Y-PENDIENTES.md` — lo que queda abierto
- `PARIDAD-ENTRE-CRMS.md` — que hay en MultiCRM y no en ISEIE, y al reves
- `AUDITORIA-FINANZAS-CRM.md` — de donde sale cada cifra de dinero
- `INFORME-AGOSTO-2026.md`, `COMPARATIVA-SUITEDASH.md`, `PLAN-FABIAN.md`
- `proceso-comercial.pdf` / `.txt` — el proceso de ventas, tal como lo pidio Carlos
- `tarea-stripe-proyectos-ia.md`, `tutores-pendiente.md`

Para el esquema de la base, la fuente es `backend/migrations/` en orden. Para
los endpoints, los `*.routes.js` de cada modulo. Para las variables,
`backend/.env.example`. No hay documento intermedio, y es mejor eso que uno que
mienta.
