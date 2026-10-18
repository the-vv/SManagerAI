# Invite-only sign-up

Set `ALLOW_REGISTRATION=false` (the default for deployments) and new accounts can only be created with an invite code.

## Roles
- The **first account ever created** is the admin (an existing install: the earliest account becomes the admin when the migration runs).
- Only admins can create, list and revoke invites (Settings → *Invite people*). Everyone else gets `403`.

## Flow
1. Admin: Settings → Invite people → optional note, expiry (1–30 days) → **Create invite**.
2. The invite **link** (`https://your-app/login?invite=CODE`) and **code** (`XXXX-XXXX-XXXX-XXXX`) are shown **once**: only a SHA-256 hash is stored.
3. The person opens the link (sign-up form opens with the code filled in) or goes to the sign-in page → *Create an account* → pastes the code. Case, dashes and spaces don't matter.
4. Registering (email + password, or Google) spends the invite. A code works once; if sign-up fails (e.g. e-mail taken) the invite is not used up.
5. Admin can see each invite's status (Active / Used by … / Expired / Revoked) and revoke unused ones.

## Rules enforced by the API
- Closed sign-up without a valid code → `403` with one generic message (never reveals whether a code exists).
- Single use, atomic: two simultaneous sign-ups cannot both spend one code.
- 80-bit random codes, sign-up rate limited per IP.
- `ALLOW_REGISTRATION=true` ignores invites (open registration).
- Endpoints: `POST/GET /api/invites`, `DELETE /api/invites/:id` (admin), `GET /api/auth/config` → `{ registrationOpen, inviteRequired }`.
