# Environment variables and secrets

Every value the app reads, where it's set, and where to get it. Nothing else is read from the environment.

- **Production secrets:** `npx wrangler secret put NAME`. They're encrypted, and nobody can read them back.
- **Local development:** copy `.dev.vars.example` to `.dev.vars`. That file is git-ignored.
- **Plain vars:** set in `wrangler.jsonc` → `vars`. They're not secret and are committed.

## Secrets (6)

| Name | What it's for | Where to get it |
|---|---|---|
| `AUTH_SECRET` | Signs magic-link codes, SMS codes and the rotating pickup/return QR codes. Changing it invalidates outstanding codes; sessions survive. | Generate one: `openssl rand -base64 32` |
| `TWILIO_ACCOUNT_SID` | SMS sign-in codes and phone verification. | [Twilio Console](https://console.twilio.com) → Account Info |
| `TWILIO_AUTH_TOKEN` | Same as above. | Twilio Console → Account Info |
| `OPENAI_API_KEY` | Three things: listing generation (photos + brief → listing), text moderation, and the **Content Provenance API**, which checks photos for OpenAI's SynthID watermark and C2PA. | [platform.openai.com](https://platform.openai.com/api-keys). If your org doesn't have Content Provenance access yet, that check is skipped and the other checks still run. |
| `SIGHTENGINE_API_USER` | AI-image classifier (`genai` model), which catches generated or edited photos that have no metadata. | [sightengine.com](https://sightengine.com) → Dashboard → API keys (Free plan) |
| `SIGHTENGINE_API_SECRET` | Same as above. | Same as above |

### Behavior when a secret is missing
- **Local dev:** emails (always) and SMS codes (without Twilio) are printed to the terminal instead of sent. Photo checks run without the classifier.
- **Production:** sign-in email fails loudly until `dibs.school` is onboarded to Cloudflare Email Service. Phone sign-in fails without Twilio. Listing generation shows "enter details manually" without OpenAI. Without Sightengine, photos pass on metadata and provenance alone; the admin overview shows a warning when that's the case.

## Plain vars (6)

| Name | Example | Notes |
|---|---|---|
| `APP_URL` | `https://dibs.school` | Used in email links and to decide whether cookies are `Secure`. Use `http://localhost:3000` in `.dev.vars`. |
| `EMAIL_FROM` | `Dibs <login@dibs.school>` | Sender for every email. Must be an address on `dibs.school`, the domain onboarded to Cloudflare Email Service. |
| `SUPPORT_EMAIL` | `support@dibs.school` | Receives access-appeal notifications. |
| `TWILIO_PHONE_NUMBER` | `+12055550123` | The Twilio number SMS is sent from, in E.164 format. You can move it to a secret if you'd rather not commit it. |
| `OPENAI_MODEL` | `gpt-6.1-sol` | Model used for listing generation. `gpt-6-astra` is higher quality and costs more; `gpt-6-luna` is the cheapest. |
| `ADMIN_EMAILS` | `you@crimson.ua.edu,teammate@crimson.ua.edu` | Comma-separated. These accounts become admins the next time they sign in. |

## Bindings (configured in `wrangler.jsonc`, not secrets)

| Binding | Resource | Create with |
|---|---|---|
| `DB` | D1 database `dibs-db` | `npx wrangler d1 create dibs-db`, then paste the id into `wrangler.jsonc` |
| `UPLOADS` | R2 bucket `dibs-uploads` (private: original photos, appeal evidence) | `npx wrangler r2 bucket create dibs-uploads` |
| `MEDIA` | R2 bucket `dibs-media` (resized photos with metadata stripped, school logos) | `npx wrangler r2 bucket create dibs-media` |
| `EMAIL` | Cloudflare Email Service `send_email` binding (all outgoing mail) | Onboard `dibs.school` in the dashboard (checklist step 6) |
| `IMAGES` | Cloudflare Images binding (resize, strip EXIF/GPS) | Nothing to create. The free allowance covers 5,000 unique transformations/month. |
| `CHAT_ROOM` | Durable Object (live chat) | Created on first deploy (migration `v1`) |
| `AUTH_LIMITER`, `AI_LIMITER` | Rate limiters | Created on deploy |
| `ASSETS` | Static assets | Created on deploy |

## Deploy-only (optional)

| Name | When you need it |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Only if you deploy from CI such as GitHub Actions. Local deploys use `npx wrangler login`. |
| `CLOUDFLARE_ACCOUNT_ID` | Same as above. |

## One-time setup checklist

1. **Cloudflare Workers Paid plan ($5/mo).** The bundle (~2.4 MB gzipped) fits the free size limit, but server rendering plus photo checks need more than the free plan's 10 ms of CPU per request.
2. Create D1 and both R2 buckets (table above), then run migrations: `npm run db:migrate:remote`.
3. Set the 6 secrets: `npx wrangler secret put AUTH_SECRET` (repeat for each).
4. Fill in `TWILIO_PHONE_NUMBER` and `ADMIN_EMAILS` in `wrangler.jsonc`.
5. The `routes` block in `wrangler.jsonc` attaches `dibs.school` as a custom domain (the zone must be on this Cloudflare account).
6. **Cloudflare Email Service:** dashboard → Compute & AI → Email Service → Email Sending → Onboard domain → `dibs.school`, then add the SPF/DKIM/DMARC records it offers. Mail won't send until the domain shows as verified.
7. **Twilio:** register the number for US messaging (A2P 10DLC brand + campaign, or toll-free verification). Texts to US numbers are blocked until approval, which can take days.
8. **Sightengine:** the Free plan allows 2,000 checks a month and 500 a day. The app caps itself at 1,900 and 450 (Admin → Settings). Photos over the cap wait under Pending and are retried automatically when the quota resets.
9. `npm run deploy`.
