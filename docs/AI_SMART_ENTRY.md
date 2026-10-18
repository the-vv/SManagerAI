# AI Smart Entry

Dashboard card: type "Lunch 250" and send it. You can close the app: the text is queued on the server, classified (title, amount, income/expense, one of **your existing** categories) and **added to your transactions automatically** (default account, dated when you sent it). Edit it later like any transaction. Entries that can't be saved safely (no amount found, no account, AI failure) stay in the **AI queue** list for you to finish. Manual entry works even when AI is off or down.

## How it works
1. `POST /api/ai/transactions/classify {text}` validates and stores a `PENDING` row in `AiJob` (SQLite) and returns `202 {jobId, status}`. It never calls the model.
2. Every `AI_SCHEDULER_INTERVAL_SECONDS` the scheduler claims up to `AI_BATCH_SIZE` jobs (`PENDING → PROCESSING`, with a claim token + lease), sends them in **one** prompt to `POST {OLLAMA_BASE_URL}/api/v1/completions` (`X-API-Key`, `temperature: 0`, bounded `max_tokens`), and saves each job's result by its own id. Oversized batches are split into sequential prompts (`AI_MAX_PROMPT_CHARS`).
3. Right after a job is classified the backend creates the transaction through the normal create path (default account, `occurredAt` = when you sent it, unique `Transaction.aiJobId` so it can never be created twice). A sweep on every scheduler run also saves anything classified just before a crash.
4. The dashboard shows the queue (`GET /api/ai/queue`: waiting, processing, needs review, failed, recently added). It polls only while something is pending and stops when the page is left. Entries that need review open the normal transaction form pre-filled; saving links it to the entry.
5. Each user has a daily allowance (`AI_DAILY_LIMIT`, resets at local midnight, failed entries are refunded), shown as "N left today". The AI gateway itself exposes no credit balance.

## Safety rules enforced by the backend
- Categories come from the job owner's rows only; the model sees short per-job codes (`c1`…), never ids, and every answer is re-validated (owner + INCOME/EXPENSE match). Unknown → `null`.
- Amounts must literally appear in the user's text (e.g. `250`, `₹80,000`, `5k`, `1.5 lakh`); otherwise the amount is left empty for the user to fill in.
- Jobs are owner-scoped (other users get 404). Per-user queue cap, input length cap, rate limit on submit.
- Failures retry with exponential backoff (30 s, 60 s, …, max 10 min) up to `AI_MAX_RETRIES`, then `FAILED`. On boot all `PROCESSING` jobs are re-queued; expired leases are recovered every run.
- Logs contain counts and durations only, never transaction text.

## Environment (backend only – never in Angular)
| Variable | Default | Notes |
|---|---|---|
| `OLLAMA_BASE_URL` | – | Empty disables the feature (card shows a manual-entry hint) |
| `OLLAMA_MODEL` | `mistral` | |
| `OLLAMA_API_KEY` | – | Sent as `X-API-Key` |
| `AI_BATCH_SIZE` | 10 | Max jobs per scheduler run |
| `AI_SCHEDULER_INTERVAL_SECONDS` | 30 | |
| `AI_REQUEST_TIMEOUT_MS` | 120000 | |
| `AI_MAX_RETRIES` | 3 | |
| `AI_MAX_CONCURRENT_REQUESTS` | 1 | |
| `AI_MAX_INPUT_CHARS` / `AI_MAX_PROMPT_CHARS` / `AI_MAX_PENDING_PER_USER` | 200 / 6000 / 20 | |
| `AI_DAILY_LIMIT` | 30 | Entries per user per local day |

The scheduler follows `SCHEDULER_ENABLED`. Keep a single API instance (SQLite). Keep Ollama on a private interface / internal Docker network; only the API container needs to reach it.

## Deploy
`npm run build`, then `prisma migrate deploy` (adds `AiJob` and `Transaction.aiJobId`; the Docker image/`start:dev` already do this), set the variables in `.env`, restart.
