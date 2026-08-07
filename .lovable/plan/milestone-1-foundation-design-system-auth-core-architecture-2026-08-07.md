# Milestone 1 — Foundation, Design System, Auth, Core Architecture

A modern game server control panel, built here as a TanStack Start app on Lovable Cloud (Postgres + auth + storage + server functions). NestJS/Prisma/Go are not buildable in this environment, so the equivalent capabilities are delivered natively, and the daemon is specified as a written contract that a future Go/Rust agent implements.

This milestone builds the skeleton every future module plugs into. No server CRUD, no node management logic.

## What you get

**Design system**
- Linear/Vercel/Raycast-inspired token set in `src/styles.css`: neutral-cool palette, single vivid accent, 18–24px radii, layered soft shadows, restrained glass surfaces.
- Perfect dark and light modes, both authored as first-class token sets with a persisted theme switcher.
- Modern typographic scale, tight tracking on headings, tabular numerals for metrics.
- Motion primitives (page fade/slide, list stagger, dialog spring) as shared variants so animation stays consistent.

**App shell**
- Collapsible icon sidebar with grouped navigation, top bar with breadcrumbs, global search, notifications bell, user menu.
- Command palette (Cmd/Ctrl+K) with grouped, extensible command registry — future modules register commands instead of editing the palette.
- Keyboard shortcut layer with a shortcuts help dialog.
- Fully responsive: mobile drawer nav, tablet-tuned density.

**Authentication**
- Email/password login, register, forgot password, reset password page, email verification handling.
- Google sign-in enabled alongside email.
- Session-aware header, sign-out hygiene, protected route gate.
- 2FA and device/session management present as wired-up UI with backing tables, enrollment logic deferred to a later milestone.

**RBAC**
- Separate `roles`/`user_roles`/`permissions` tables (never a role column on profiles), security-definer `has_role`/`has_permission` functions used by all policies.
- Roles: owner, super_admin, admin, moderator, support, user, guest, with granular permission keys.
- Client-side `<Can permission="...">` guard plus server-side enforcement.

**Database schema** (schema only, plus seed rows for roles/permissions/settings)
users/profiles, roles, permissions, role_permissions, user_roles, sessions, api_keys, nests, eggs, egg_variables, locations, nodes, allocations, servers, server_variables, backups, schedules, schedule_tasks, databases, audit_logs, notifications, settings, webhooks.
Every table gets GRANTs, RLS enabled, and ownership/role-scoped policies.

**Core architecture**
- Route tree stubbed for every future page (dashboard, servers + tabs for console/files/backups/schedules/network/settings, admin sections, account sections) with polished empty states so nothing 404s.
- Zustand stores for UI state; TanStack Query with a typed query-key factory and standard loader/`useSuspenseQuery` pattern.
- Zod schemas + React Hook Form wrappers as the single form pattern.
- Notification framework: in-app center backed by the notifications table, plus toast layer.
- Audit log framework: one `recordAudit` helper every future mutation calls.
- Settings framework: typed key/value registry rendered by a generic settings form.
- Reusable components: data table (sort/filter/paginate/empty/loading), form field kit, dialogs, drawers, charts, stat cards, terminal container shell, file-tree shell, code editor container.
- Loading skeletons, empty states, error boundaries, 404/500 pages.
- Theme system: tokens + component variants only, so an alternate theme is a token override.

**Daemon abstraction**
- `DaemonClient` TypeScript interface covering power, console stream, stats, files, backups, allocations, install/rebuild.
- Mock adapter implementing it locally so UI is functional now; an HTTP/WS adapter swaps in with zero component changes.
- `docs/daemon-contract.md`: REST endpoints, request/response schemas, WebSocket message types, panel↔daemon JWT flow, heartbeat, error codes.
- `docs/architecture.md` + `docs/deployment.md` describing the reference Docker/reverse-proxy topology for the future daemon fleet.

## Technical notes

- Stack: TanStack Start + React + TypeScript + Tailwind v4 + shadcn/ui + Motion + TanStack Query + React Hook Form + Zod + Zustand. This is the required stack here; Next.js/NestJS are not available.
- Backend: Lovable Cloud (Postgres, RLS, auth, storage, server functions) replaces Prisma/Redis/BullMQ. Scheduling and queues are modeled in the schema now and executed later via scheduled server routes.
- All data access goes through typed server functions or the generated Supabase client, never ad-hoc fetch.
- Secrets (daemon signing key, OAuth, S3) are stored via the secrets manager, never in code.

## Out of scope for this milestone

Server/node CRUD logic, real Docker orchestration, the Go/Rust daemon binary, installer shell scripts, plugin SDK runtime, billing.

## Next milestones

2. Servers module (CRUD, power, console via DaemonClient) · 3. Nodes, locations, allocations, eggs/nests · 4. Files, backups, schedules, databases · 5. Admin panel depth, webhooks, API keys, monitoring · 6. Real daemon adapter + deployment docs.
