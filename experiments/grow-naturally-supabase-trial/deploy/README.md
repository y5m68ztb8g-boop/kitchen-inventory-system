# Grow Naturally public deployment

This deployment runs the existing Grow Naturally application in Docker on the Hetzner server.

Public URL during the temporary IP-only phase:

`http://46.224.64.2`

## Commands

```bash
docker compose -f docker-compose.public.yml up -d --build
docker compose -f docker-compose.public.yml ps
docker compose -f docker-compose.public.yml logs --tail=100 grow-naturally
docker compose -f docker-compose.public.yml down
```

The application data directory is `local-data/`. It contains the inventory JSON and SQLite databases and is mounted into the container so container recreation does not remove the data.

The container is intentionally bound to `127.0.0.1:4174`; put it behind a reverse proxy with a real domain and HTTPS before sharing it with employees. Set `AUTH_REQUIRED=true`, `VITE_AUTH_REQUIRED=true`, `AUTH_COOKIE_SECURE=true`, `AUTH_ADMIN_USERNAME`, and `AUTH_ADMIN_PASSWORD` in the server-only `.env`. The password is never sent to the browser and is used only to create the first administrator in `local-data/auth.sqlite`.

The current release supports one administrator account. Additional employee roles can be added later without changing the inventory data model. `AUTH_ALLOW_WEAK_BOOTSTRAP_PASSWORD=true` is only for the temporary `admin` test password and must be removed before regular employee use.
