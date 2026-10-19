# PunkPod

PunkPod is a focused co-study workspace for people who want to find compatible study partners, plan realistic goals, and make focus time stick.

## Current build

This repository contains a polished browser UI plus a Node.js/Fastify API MVP. The UI still works as a local preview when the API is unavailable, while Docker Compose runs the frontend and persistent SQLite backend together. It includes:

- Responsive PunkPod landing page and visual identity.
- Dashboard with daily goals, completion percentage, streak, activity and study shortcuts.
- Matching flow for random pods, preferred matches, one-to-one study and private groups.
- Language and learning-path selection across English, Telugu, Hindi, Malayalam, Kannada and Tamil.
- Searchable education catalogue with exams, degrees, careers and research pathways kept as separate types.
- Study room with default-muted controls, timer, participant states, text chat, reactions/raise-hand feedback and reconnection-friendly room state.
- Friendly wellness reminder after 60 minutes of continuous active focus; pauses do not count, and a meaningful break resets the interval.
- Server-backed room chat with member-only retrieval, 2,000-character validation, 30-day deletion, reports and administrator-reviewed room moderation.
- Optional women-only one-to-one matching preference enforced by the backend without silent fallback; profile supports optional age, private gender and safe cartoon avatar IDs.
- Statistics view that distinguishes recorded focus time from self-reported task completion.
- Local preview persistence using `localStorage`; Docker/API persistence uses SQLite in a named volume.
- Beginner-readable source with no secrets or external service credentials.

## Run locally

No package manager is required to open the browser build. Open `index.html` in a modern browser. For a local HTTP server, use any static server available on your machine, for example:

```powershell
# If Python is installed
python -m http.server 4173
# then open http://localhost:4173
```

The browser preview has no runtime dependencies. Node.js 20+ is used only for
the pure domain test suite:

```bash
npm test
```

For a local HTTP server, run `npm run serve` (or `npm.cmd run serve` in
PowerShell when script execution policy blocks `npm.ps1`), then open
`http://localhost:4173`. The included `dev-server.cjs` avoids requiring Python.
See `docs/DEPLOYMENT.md` for Windows/Linux Docker commands.

## Docker Compose (frontend + API)

The included `Dockerfile`, `backend/Dockerfile`, `nginx.conf` and
`docker-compose.yml` provide a repeatable frontend/API deployment:

```bash
docker compose up --build -d
```

The default URL is `http://localhost:8080`; set `PUNKPOD_PORT` in `.env` to
change the host port. Nginx proxies `/api/*` to Fastify. The backend uses a
temporary `x-user-id` header identity for development, not production auth.

## Backend MVP

The `backend/` directory contains a TypeScript Fastify API with SQLite
persistence and a seeded catalogue. From `backend/`, run `npm install`, then
`npm run typecheck`, `npm run build`, and `npm start`. API routes are versioned
under `/api/v1` and use the `x-user-id` header as a temporary MVP identity
boundary.

## Production architecture to add next

The MVP is structured so the production implementation can add:

1. Real authentication replacing the development header identity.
2. PostgreSQL migrations with unique constraints for pod capacity and duplicate memberships.
3. Server-side sessions or JWT rotation, role-based access control, rate limiting, blocking/reporting and minor-safety rules.
4. WebRTC or an approved managed real-time provider for audio/video; the current build does not fake live media.
5. Payment-provider sandbox integration with server-side entitlement checks; proposed ₹99 pricing is configuration only.
6. CI, browser tests, accessibility checks, environment configuration and deployment.

The 30-day chat policy applies to room and direct-message records. Cleanup runs
when the API starts and hourly while it is running. SQLite is persistent only
where the deployment provides persistent disk/volume storage; it is not cloud
storage by itself. Audio/video recording is not implemented.

The current test suite covers the domain rules that can be verified without a
backend: pod capacity, task completion percentages, catalogue search, and
default entitlements. The browser UI remains intentionally dependency-free.

See `docs/DELIVERY_STATUS.md` for the verified limitations and handoff.

## Safe configuration

Copy `.env.example` when the production service is introduced. Never commit `.env`, API keys, payment secrets, or real user data.
