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

Keep server URLs in `NEXT_PUBLIC_API_URL` and keep authentication, persistence, validation, and business rules in the API service rather than this frontend.

While the backend is under development, auth forms use the mock adapter by default. Set `NEXT_PUBLIC_AUTH_MODE=api` to route login and password-recovery requests to the API. Mock mode is for frontend development only and does not create a secure session.

## PWA

The installable app is configured through `src/app/manifest.ts`, `public/icons/icon.svg`, and `public/sw.js`. The service worker is registered only in production and caches the app shell plus same-origin frontend resources. API and GraphQL paths are deliberately excluded so live school data is never served from a stale cache.