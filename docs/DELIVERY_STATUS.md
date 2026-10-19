# PunkPod delivery status

## Verified in this environment

- The workspace was initially empty apart from OmniRush/OpenCode configuration.
- OmniRush extension inspection exposed Google Workspace and image-generation actions, but no GitHub action, database service, deployment service, or real-time media service.
- The web interface remains dependency-free HTML, CSS and browser JavaScript so it can be inspected without installing a frontend starter kit.
- Local state is persisted under the `punkpod-state` browser storage key.
- A dependency-declared `backend/` MVP now includes Fastify routes, SQLite schema/migration, seeded catalogue source, configurable entitlements, tasks, focus events, stats, matching and invitations. Docker Compose connects it to the Nginx frontend through `/api/`.
- The study-room preview now preserves the selected learning path, uses six-person standard pods and a separately labelled 128-seat public commons, derives task/focus counts from local state, and records completed focus/break timers separately.
- The room preview includes emoji insertion, per-message local reactions, persistent local pod IDs/invitation codes, and a local private one-to-one conversation with an explicit return-to-group action. API-backed room message history and posting are implemented when a matched backend pod is available.
- The backend now persists room reactions and authorized pod-scoped direct messages, and records completed focus/break sessions with an optional break category. Existing SQLite files are upgraded with the new session column at startup.
- The add-on safety migration adds 30-day room/direct chat cleanup, reports, room restrictions, moderation audit records, private profile metadata and backend-enforced women-only matching. Avatar handling is limited to safe built-in avatar IDs; uploads are intentionally not enabled.

## Not claimed as complete

This environment currently has no `node`, `npm`, `python`, `git`, GitHub integration, or deployment CLI on PATH. Therefore the following have **not** been claimed or simulated:

- Production authentication or a hosted server-backed database (the backend MVP uses a temporary `x-user-id` header identity; SQLite is suitable for this MVP, not horizontal production scale).
- Real multi-user matching, WebRTC audio/video, or a hosted websocket service.
- The browser preview does not claim WebRTC audio/video. Room message polling is a lightweight API synchronization path, not a full websocket presence system. The frontend now consumes server-backed group reactions and attempts pod-scoped private-message reads/writes when a usable pod/member identity is available, while preserving the local fallback.
- The focus reminder is client-side because the timer is currently browser-driven; server-recorded focus sessions remain separate from reminder state. Moderation admin provisioning, real authentication, appeal handling, cloud database hosting, and real-time media remain deployment requirements.
- Live payments, subscriptions, renewal, cancellation, or payment webhooks.
- Production deployment or a public URL.
- GitHub repository creation, commit, or push.
- Automated test/build/CI results from this environment. The repository now includes Node's built-in test setup, but Node, npm and Docker are unavailable on this machine; the user's separate Windows checkout reported these checks passing before this handoff.

The UI presents these boundaries honestly. It is a functional browser preview, not a production-ready multi-user service.

## Exact next handoff

On a developer machine with Node.js 20+, run `npm test`, then from `backend/` run `npm install`, `npm run typecheck`, and `npm run build`. Use `docs/DEPLOYMENT.md` for Docker Compose. Replace the development identity, add a real-time provider and payment sandbox only when approved, then commit and push to the user-approved repository/branch. Do not add real credentials to this repository.
