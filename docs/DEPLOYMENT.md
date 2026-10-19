# PunkPod run and deployment guide

PunkPod now includes a browser MVP plus a versioned Fastify/SQLite API. Docker
Compose runs the Nginx frontend and API together with a persistent SQLite volume.
The API uses a temporary `x-user-id` header identity for development; replace
that with real authentication before onboarding real users. Audio/video and
payments remain intentionally unconfigured.

## Prerequisites

- Node.js 20+ for the test suite.
- Docker Desktop (Windows) or Docker Engine + Compose plugin (Linux) for the
  frontend/API containers.

## Windows

Run tests from PowerShell:

```powershell
npm.cmd install # use npm.cmd if PowerShell blocks npm.ps1
npm.cmd test
npm.cmd run serve
```

Open `http://localhost:4173`. To run the container:

```powershell
Copy-Item .env.production.example .env
docker compose up --build -d
```

Open `http://localhost:8080`. The frontend proxies `/api/*` to the backend, and
the backend stores its SQLite database in the named `punkpod-data` volume. Stop
it with `docker compose down`.

## Linux

```bash
npm test
npm run serve
```

For the container:

```bash
cp .env.production.example .env
docker compose up --build -d
curl -f http://localhost:8080/
```

Stop it with `docker compose down`. Put a TLS-terminating reverse proxy in
front of the container for a public deployment, and set a real `server_name`
in the proxy rather than exposing Nginx directly to the internet.

## Release checklist

1. Run `npm test` on Node 20 or newer.
2. From `backend/`, run `npm install`, `npm run typecheck`, and `npm run build`.
3. Build with `docker compose build --no-cache` and verify both health checks.
4. Review `.env` and ensure no secrets are copied into the image or committed.
5. Replace development identity with authentication, then add production
   moderation, observability, WebRTC, payment webhooks, backups and TLS before
   onboarding real users.
