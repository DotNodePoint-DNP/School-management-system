# Adding a module

Use a plural lowercase folder under `modules/`. Each domain owns `components/`, `services/`, `types.ts`, `validation.ts`, and optional `store/` and `hooks.ts`.

Create dashboard routes under `app/(portal)/dashboard/`. Register each section and its API permission codes in `modules/dashboard/components/Navigation.ts`. Use `requireDashboardPage` for server pages and check individual grants before displaying actions. Domain services use `lib/api/client.ts`.
