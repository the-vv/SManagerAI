# SManager – personal finance manager

Angular 21 + Taiga UI 5 + Tailwind 4 · NestJS 12 · Prisma 7 + SQLite · Capacitor 8 (Android) · Docker/Caddy.
One person, one VPS, one SQLite file.

```
apps/api   NestJS REST API, Prisma schema + migrations, scheduler, tests
apps/web   Angular app (+ Capacitor Android project in apps/web/android)
deploy/    Dockerfiles, inner Caddyfile, backup/restore scripts
docs/      Architecture & financial rules, deployment, Android, Google OAuth
```

## Versions (verified compatible, Oct 2026)

| Piece | Version | Note |
|---|---|---|
| Angular | 21.2 | Angular 22 requires Node ≥ 22.22.3; this repo supports Node ≥ 22.12 |
| Taiga UI | 5.28 | peers Angular ≥ 19 |
| Tailwind CSS | 4.3 | via `@tailwindcss/postcss` |
| NestJS | 12 | ESM-only → the API is native ESM (`"type": "module"`) |
| Prisma | 7.10 (stable) | `latest` tag is the 8.0 RC; SQLite via `@prisma/adapter-better-sqlite3` |
| Capacitor | 8.5 | Android |

## Run locally

```bash
npm install
cp apps/api/.env.example apps/api/.env
npm run db:migrate            # creates apps/api/dev.db
npm run dev:api               # http://localhost:3000  (Swagger: /api/docs)
npm run dev:web               # http://localhost:4200, proxies /api -> :3000
```
Open the web app and create the first account (registration is always open for the very first user).

## Tests

```bash
npm test                      # API: unit + integration tests against a real migrated SQLite DB
npm test -w @smanager/web     # web: formatting / timezone / money parsing
```
The API suite covers income/expense math, balances, month carry-forward, backdated edits/deletes, transfers,
credit cards, adjustments, schedules (month ends, leap years), duplicate prevention (incl. parallel runs and
restart), missed-run recovery, pause/resume, failures, timezone boundaries, filters, auth, ownership,
dashboard ↔ transactions ↔ reports consistency.

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) – money storage, **balance rules**, timezone policy, API shape, scheduler
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) – VPS with Docker Compose + Caddy, backup/restore, upgrades
- [docs/AI_SMART_ENTRY.md](docs/AI_SMART_ENTRY.md) – optional AI quick entry (queue, env vars, safety rules)
- [docs/ANDROID.md](docs/ANDROID.md) – Capacitor build/sync/Android Studio
- [docs/GOOGLE_OAUTH.md](docs/GOOGLE_OAUTH.md) – optional Google sign-in
