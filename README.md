# Dibs

Short-term rentals between students, like borrowing a TI-84 for the week of an engineering exam. Sign-in is verified with your school's `.edu` email. Every campus is its own community, and anyone can browse across campuses. Live at **dibs.school**.

Built for Hackbama Track 01 (multi-campus marketplace).

## What's in here

| Area | Where |
|---|---|
| Sign-in: magic link + 6-digit code, optional SMS, school autofill, access appeals | `src/app/(auth)`, `src/lib/auth`, `src/lib/schools` |
| New-campus provisioning: any `.edu` auto-creates its campus, with logo, colors and coordinates pulled from Wikidata into R2 | `src/lib/schools/service.ts`, `src/lib/schools/logo.ts` |
| Listing flow: camera/dropzone → AI or manual details → visibility → price | `src/components/flow`, `src/app/(focus)/lending/new` |
| Anti-AI photo layer: metadata/C2PA/IPTC scan → OpenAI SynthID + C2PA → Sightengine classifier | `src/lib/verify` |
| Feed, search (D1 FTS5), friends-only visibility, cross-campus distance | `src/lib/listings/queries.ts` |
| Rentals: request → accept → verified pickup → verified return | `src/lib/rentals` |
| Rotating pickup/return QR codes + scanner | `src/lib/rentals/handoff.ts`, `src/components/rental` |
| Chat: D1 + Durable Object WebSockets, with polling as a fallback | `src/lib/chat`, `src/server/chat-room.ts`, `worker.ts` |
| Admin panel | `src/app/admin` |
| Cron: expirations, reminders, scan retries, cleanup | `src/lib/jobs.ts` |

The stack is Next.js 16 (App Router) and Tailwind v4, running on Cloudflare Workers via `@opennextjs/cloudflare`, with D1 + Drizzle, R2, the Images binding, Durable Objects, Cloudflare Email Service, Twilio, OpenAI and Sightengine.

## Run it locally

```bash
npm install
cp .dev.vars.example .dev.vars        # then set AUTH_SECRET (openssl rand -base64 32)
npm run db:migrate:local
npm run dev                            # http://localhost:3000
```

In local dev, sign-in emails (and SMS codes without Twilio keys) print to the terminal. Use `npm run preview` to run the real Worker locally, which includes the chat WebSockets, the Durable Object and the custom `worker.ts`.

```bash
npm test          # unit tests (domain rules, handoff codes, AI-metadata detection, dates, search)
npm run typecheck
```

## Deploy

See **[docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)** for every secret, var and binding, plus the one-time setup. Then run:

```bash
npm run deploy
```

To refresh the university directory seed (`migrations/0002_school_directory.sql`), run `node scripts/build-school-seed.mjs <world_universities_and_domains.json>`.
