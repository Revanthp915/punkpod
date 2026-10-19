# PunkPod API

Fastify + SQLite MVP. Dependencies are declared but intentionally not installed by this change.

```sh
npm install
npm run dev
```

The API is versioned under `/api/v1`. Set `DATABASE_FILE` to choose the SQLite file. Premium entitlements are configuration-only and default to disabled (`PREMIUM_ENABLED=false`).

Room and direct messages are retained for 30 days and cleaned at startup and hourly. Message text is limited to 2,000 characters. Profile updates accept `age` (13-120), `gender` (`female`, `male`, `nonbinary`, or `unspecified`), `matchingPreference` (`any` or `women-only`), and a safe `avatarId` (identifier only; uploads are not accepted). Women-only matching is two-person and only joins pods whose existing members have `female` profiles and the same women-only preference. A general matcher cannot join a women-only pod.

Members can submit `POST /api/v1/reports`. Moderators are users whose database `role` is `admin`; they can review `GET /api/v1/admin/reports`, decide with `PATCH /api/v1/admin/reports/:id` using `dismissed`, temporary `restricted` (1-30 days), or `removed` (removes the reported member from that room), and inspect `GET /api/v1/admin/moderation/audit`. There is no permanent-ban endpoint or automatic recording.
