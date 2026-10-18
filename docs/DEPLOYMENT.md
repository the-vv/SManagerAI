# Deploying to your VPS

Stack: `api` (NestJS + SQLite on a bind-mounted local disk) and `web` (Caddy serving the Angular build and proxying
`/api` to `api`). Your existing host Caddy (behind Cloudflare) terminates TLS and proxies to the `web` container.

## First deploy
```bash
git clone <your repo> /opt/smanager && cd /opt/smanager
cp .env.example .env && nano .env          # CORS_ORIGINS, ALLOW_REGISTRATION, WEB_PORT ...
mkdir -p data backups
# the API runs as uid 1000 inside the container - give it the volumes (one-time)
docker compose run --rm --no-deps -u root --entrypoint sh api -c 'chown -R node:node /data /backups'
docker compose up -d --build
docker compose ps                           # api should become "healthy"
```
Migrations are applied automatically on every start (`prisma migrate deploy`).

Add the site to your host Caddyfile (see `deploy/Caddyfile.host.example`):
```
finance.example.com {
	encode zstd gzip
	reverse_proxy 127.0.0.1:8080
}
```
Cloudflare: SSL/TLS **Full (strict)**; don't cache `/api/*`. Then open the site and create the first user.
Afterwards keep `ALLOW_REGISTRATION=false` (the first user can always register; nobody else can).

Security notes: the API port (3000) is only `expose`d inside the compose network; the web port is bound to
`127.0.0.1`. Secrets live in `.env` (not in git). Swagger is disabled by default. Cookies are `Secure` +
`HttpOnly`. `X-Forwarded-*` is trusted from the proxy so rate limiting sees real client IPs.

## SQLite rules (do not break these)
* Keep `./data` on a **local** disk – never NFS/SMB/synced folders.
* **Never run more than one `api` container** against the same file (also: the scheduler is single-instance).
* Back up with the script below, not by copying `smanager.db` while running (WAL content would be missed).

## Backups
`deploy/backup.sh` uses SQLite's online backup API inside the container (consistent, includes WAL content, verified
with `integrity_check`, stored as a single gzip'd file) and prunes backups older than `KEEP_DAYS` (default 30).
```bash
./deploy/backup.sh                                   # manual
crontab -e   # daily at 03:15
15 3 * * * cd /opt/smanager && ./deploy/backup.sh >> backups/backup.log 2>&1
```
Also copy `backups/` off the server (rsync/rclone/object storage) – a backup on the same disk is not a backup.

## Restore
```bash
./deploy/restore.sh backups/smanager-20261017T031500Z.db.gz
```
Stops the stack, moves the current DB aside (`data/smanager.db.before-restore-*`), removes stale `-wal/-shm`, restores
the file, fixes ownership and starts again. Tested: data created after the backup disappears, logins keep working.

## Upgrades
```bash
cd /opt/smanager && ./deploy/backup.sh && git pull
docker compose up -d --build        # rebuilds, runs new migrations on start
docker compose logs -f api
```
Roll back: `git checkout <previous>` + rebuild; if a migration must be undone, restore the pre-upgrade backup.

## Operations
* Logs: `docker compose logs -f api` (json-file, rotated 10 MB × 5).
* Health: `curl -s http://127.0.0.1:8080/api/health`; both containers have health checks and `restart: unless-stopped`.
* Changing the timezone only affects how months/days are computed; stored data is UTC.
