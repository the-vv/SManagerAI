# Architecture & financial rules

## Money
Every amount is an **integer number of minor units** (paise). SQLite has no exact decimal type, so floats would
drift; `BigInt` columns (64-bit) and `SUM()` over integers are exact. The API speaks plain JSON integers
(safe to 9×10¹⁵ minor units). The web app parses user input (`"1,250.5"` → `125050`) and formats using
decimal *strings*; it never multiplies or divides money as floating point.
`Transaction.amount` is always > 0; direction comes from `kind` (`INCOME`, `EXPENSE`, `TRANSFER_OUT`, `TRANSFER_IN`).

## One calculation engine
`apps/api/src/ledger/ledger.service.ts` is the only code that adds up money. Dashboard, transaction list
summaries, account pages and reports all call it (and `transactions/filters.ts` builds the single shared filter),
so totals cannot disagree. Nothing is cached or duplicated: **balances are derived**, so backdated inserts,
edits and deletes are reflected immediately.

## Balance rules
For one account, the balance just before instant *T* is

```
openingBalance (if openingDate < T)
+ Σ INCOME + Σ TRANSFER_IN      (occurredAt < T)
− Σ EXPENSE − Σ TRANSFER_OUT    (occurredAt < T)
+ Σ balance adjustments         (effectiveAt < T)
```

* **Carry-forward** is implicit: a month's *opening* is the balance before its first instant, its *closing* is the
  balance before the next month starts. No "carry-forward transactions" exist; nothing resets.
  `opening + income − expenses + transfers + adjustments = closing` (shown on the dashboard).
* An account that starts inside a month contributes its opening balance to that month's opening.
* Nothing may be dated before an account's opening date (rejected).
* **Net movement** = income − expenses. Transfers and adjustments are *never* income/expense.
* **Transfers** = one `Transfer` row + two linked legs, written/edited/deleted atomically. Paying a credit card is a
  transfer from a bank account to the card (so card spending is counted once, as an expense, when spent).
* **Adjustments** (manual corrections with reason + date) are stored as a signed delta, separate from
  transactions. "Set balance to X as of D" computes the delta server-side.
* **Credit cards**: the balance is signed; negative = amount owed. Combined figures:
  * *Available* = Σ balance of **active** bank/savings/cash accounts (card debt is **not** subtracted from it).
  * *Credit card dues* = amount owed on active cards.
  * *Net position* = available − dues.
  * Inactive accounts keep their history, are included in historical income/expense/balance reconciliation, and
    are excluded from the "current" combined figures.
* "All accounts" aggregates never double count transfers. In the transaction list, a transfer shows once
  (`A → B`) unless you filter by an account, where you see that account's leg.

## Time
Instants are stored in UTC. "Month", "day" and schedule dates are evaluated in the user's IANA timezone
(Settings; default `Asia/Kolkata`) using half-open ranges `[from, to)`. Automation dates are plain `YYYY-MM-DD`
strings in that timezone and record at 09:00 local.

## Automations
* `schedule.ts` computes occurrence *n* from the anchor (never "previous + 1 month"), so the 31st clamps to short
  months without drifting (31 Jan → 28 Feb → 31 Mar) and 29 Feb yearly falls back to 28 Feb.
* `Automation.nextRunDate` in the database drives everything; the timer (`@nestjs/schedule`, every 5 min and once
  at boot) only asks "what is due?". Downtime ⇒ all missed occurrences are processed on the next run.
* Duplicates are impossible: unique `occurrenceKey` and `(automationId, scheduledFor)` on executions, plus unique
  `(automationId, occurrenceDate)` on transactions; each occurrence is processed in one DB transaction that also
  advances the schedule.
* **AUTO** records a transaction labelled *Auto*; **REMINDER** creates a pending item you Confirm (optionally with a
  different amount) or Skip. Failures (e.g. inactive account) are recorded, don't block later occurrences, and can be
  retried. Pausing stops processing; resuming does not back-fill the paused period.
* It never talks to a bank. It records or reminds only.

## API
REST under `/api`, DTO-validated (`whitelist + forbidNonWhitelisted`), errors always
`{ statusCode, error, message, details?, path, timestamp }`. Every route requires a session unless marked `@Public()`
(health, login, register, config); every query includes the authenticated `ownerId` and cross-owner references
return 404. Swagger at `/api/docs` (off in production unless `SWAGGER_ENABLED=true`).

## Auth
Server-side sessions: a random 256-bit token (only its SHA-256 is stored), 30-day sliding expiry, revocable
(Settings → Sessions). Passwords: Argon2id. Web: httpOnly, `SameSite=Lax`, `Secure` cookie. Android: the API also
returns the token (only when `X-Client: native`) and the app sends it as a Bearer token. Login/register/password
endpoints are rate limited (in-memory; fine for a single instance).

## SQLite
`journal_mode=WAL`, `busy_timeout`, `foreign_keys=ON`. Single API instance only; the DB must be on a local disk.
Schema/migrations: `apps/api/prisma/`. Deletion is conservative: accounts with history can only be deactivated;
deleting a category un-categorizes its transactions; deleting an automation keeps the transactions it recorded.
