# Frontend architecture

The frontend is organized by responsibility:

- `src/app/` owns Next.js routes, metadata, and global styles.
- `src/features/` owns user-facing workflows and composed UI.
- `src/core/` owns cross-cutting concerns such as authorization, session contracts, configuration, and API access.
- `src/domains/` owns school business domains such as students, attendance, academics, finance, staff, admissions, transport, and reports.
- `src/shared/` owns reusable UI, forms, tables, and utilities.
- `src/lib/api/` remains the frontend transport boundary. Backend services can evolve independently behind these contracts.

## Domains

The marketing website is served on the primary domain, for example `Pathivara .example`. The ERP is served on the secondary application domain, for example `app.Pathivara .example`. `src/proxy.ts` rewrites the app subdomain root to the portal dashboard. Set `APP_SUBDOMAIN` in deployment environments; local development can use `/dashboard` directly.

## Roles

The frontend recognizes four roles: `teacher_staff`, `school_admin`, `accountant`, and `parent`. `src/core/authorization/` owns permissions and role-aware navigation. These checks control the interface only; the API must independently authorize every request and enforce school/tenant scope.

Set `NEXT_PUBLIC_API_URL` at build time to the browser-reachable backend origin, optionally including `/api/v1` (for example, `https://api.example.com/api/v1`). The shared API client adds `/api/v1` when it is not already present. Production requires HTTPS. This URL is public configuration, not a secret. Configure the API server's `CORS_ORIGINS` for the web app origin when using direct browser API requests.

Authentication always uses the API through same-origin Next.js route handlers. Configure `SESSION_SECRET` on the web server with at least 32 random characters; it signs the HTTP-only session cookie and must never be exposed to the browser. The session and backend refresh-token cookies expire with the backend refresh session. The API currently supports sign-in, session refresh, sign-out, current-user lookup, and authenticated password change; password recovery/reset is not exposed until the backend adds those endpoints.

The workspace shown after sign-in is derived from the backend system roles (`ADMIN`, `TEACHER`, `ACCOUNTANT`, `PARENT`), while dashboard navigation is filtered using the backend permissions. The API remains the authority for every data request. `NEXT_PUBLIC_AUTH_MODE` is retained only for the separate admission-form demo/API switch; it no longer changes authentication behavior.

## PWA

The installable app is configured through `src/app/manifest.ts`, `public/icons/icon.svg`, and `public/sw.js`. The service worker is registered only in production and caches the app shell plus same-origin frontend resources. API and GraphQL paths are deliberately excluded so live school data is never served from a stale cache.