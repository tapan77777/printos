# PrintOS — V0

Self-service printing platform. Software-only for now (no Raspberry Pi / kiosk / custom hardware).

## Structure

```
printos/
├── apps/
│   ├── web/      # Next.js customer + admin app (frontend + API routes)
│   └── agent/    # PrintOS Agent — runs on your laptop, talks to CUPS
├── prisma/       # Printer + PrintJob schema
└── docs/
```

## Milestone 1 status (this scaffold)

- [x] Repo structure
- [x] Next.js + TypeScript + Tailwind config
- [x] Prisma schema: `Printer`, `PrintJob`
- [x] Basic customer page (`/p/[printerId]`)
- [x] Basic admin page (`/dashboard`)
- [x] PrintOS Agent skeleton (`apps/agent`) with `PrintDevice` interface
- [ ] Actual DB migration run (needs your Postgres connection string)
- [ ] Upload → Job creation wired to DB
- [ ] Agent ↔ Cloud connection
- [ ] CUPS integration

## Setup on your machine

1. `cd apps/web && npm install`
2. Create `apps/web/.env` with `DATABASE_URL="postgresql://..."` (your Supabase/Neon URL)
3. `npx prisma migrate dev --name init` (from `apps/web`, or wherever `prisma/schema.prisma` is referenced)
4. `npm run dev`
5. Visit `http://localhost:3000/p/printer-001`

## Next milestone (2 → 4)

Wire the upload flow to actually create a `PrintJob` row in Postgres, then build the job queue view in `/dashboard/jobs`.

## Recommended: use Claude Code for the rest

This scaffold is hand-written. From here on, the real work — running `npm install`, iterating on the DB, testing the Agent against your actual printer via CUPS — happens on your machine. Claude Code (desktop or terminal) can run commands and edit files directly in this repo, which will be much faster than going back and forth in chat.
