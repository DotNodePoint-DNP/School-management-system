# Adding a module

Use a plural lowercase folder under `modules/`. Each domain owns `components/`, `services/`, `types.ts`, `validation.ts`, and optional `store/` and `hooks.ts`.

Create routes only in `app/dashboard/<module>/`; pages compose module components and never call an API. Register the permission in `core/authorization/permissions.ts`, route navigation in `core/authorization/navigation.ts`, and route protection through `permissionForDashboardPath`. Every service uses `lib/api/client.ts`; route handlers and server actions repeat the same `can()` check.
