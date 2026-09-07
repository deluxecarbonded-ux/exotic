# ✦ Exotic

**Crack the four-digit code.** A modern, monochrome, AI-powered brain-teaser where you answer
riddles, math, science and trivia to earn clues about a secret 4-digit code — then guess it
Mastermind-style (exact + misplaced feedback) before your attempts or the timer run out.

Built with **Next.js 16 (Turbopack) + React 19 + Tailwind 4 + TypeScript 7**, **Supabase** (separated schemas, RLS, RPCs, realtime)
and **Ollama AI** (every question and every Oracle hint is generated live).

---

## Feature map

| Area | What's inside |
|---|---|
| **Single Player** | Solo Vault with difficulty tiers, countdown timer, AI question loop, clue engine, keypad with exact/partial feedback, daily reward, streaks, XP/levels, 8 achievements, Sparks (✦) economy |
| **Multiplayer** | Realtime Duel Arena: create/join rooms by 5-char code, quick match, ready-up flow, live scoreboard, race-to-answer rounds, 3 guesses each, draws, rematches, in-room chat + emotes, rank points, Novas (◆) economy |
| **Shops (separated)** | Solo Shop (gear, boosters, avatars) vs Duel Shop (emotes, avatars, frames) — different catalogs, different currencies |
| **Profiles (separated)** | Solo profile vs Duel profile: different tables, different fields, different auth, different avatars/stats |
| **Auth (separated routes)** | `/auth/sp` — anonymous device vault · `/auth/mp` — email/password duel account. Two isolated sessions in the same browser |
| **AI** | Ollama generates every question + The Oracle hints (`/api/ai` proxy, edge function included, deterministic fallback if Ollama is offline) |
| **Realtime** | Every duel event (rooms, players, rounds, guesses, chat, profiles) streams over Supabase Realtime — zero page refreshes |
| **i18n** | 16 locale files × **337 keys** (en, es, fr, de, it, pt, ja, ko, zh, ru, ar, hi, tr, nl, pl, sv) — UI, all 24 shop items + 16 achievement names, all 38 game-error messages, aria-labels, page title/meta, and AI fallback fun-facts/Oracle hints (both `/api/ai` and the edge function) · RTL for Arabic · `<html lang>` + localized tab title & description per locale |
| **Design** | Pure `#ffffff` light / `#000000` dark, white buttons on dark / black buttons on light, Lucide icons colored by theme, no borders/outlines/gradients, responsive desktop + mobile (bottom tab bar) |

---

## ✅ Live project status (already deployed)

The game is wired to the live Supabase project **`teqnhdhearzrywiqssom`** —
`.env.local` contains the real URL + anon key + current DB password (pooler
host), and all migrations were pushed with the Supabase CLI:

```bash
# IPv4 session pooler (sandbox/CI has no IPv6 — use this for CLI work)
npx supabase db push \
  --db-url 'postgresql://postgres.teqnhdhearzrywiqssom:<PW>@aws-0-us-west-2.pooler.supabase.com:5432/postgres' --yes
```

| What | Status |
|---|---|
| Supabase CLI | ✅ logged in + project linked (`supabase link`) |
| Migrations `0001`–`0007` | ✅ applied via `supabase db push` — `supabase migration list --linked` shows local = remote (7/7) |
| Realtime | ✅ **all 23 game tables** published (`supabase_realtime`) + `replica identity full` — verified with live websocket tests using the app's exact channel shape: rooms ×4, room_players ×9, rounds, guesses, chat — 100% delivered, in order |
| Index Advisor | ✅ `hypopg` + `pg_stat_statements` extensions enabled |
| PostgREST | ✅ `public, sp, mp` schemas exposed (`pgrst.db_schemas`) — verified over REST |
| RLS | ✅ every table locked; `sp.secrets` / `mp.secrets` / `mp.answers` have **zero policies** (invisible to any API client) |
| Anonymous sign-ins (SP vault) | ✅ **enabled** via the Management API |
| Email autoconfirm (MP signup) | ✅ **enabled** — instant signup, no confirmation emails, no rate cap |
| Edge functions | ✅ `ai`, `rotate-shop`, `cleanup-rooms` deployed via CLI; `ai` falls back to the deterministic generator when Ollama is offline (`ai: false` flag) |
| End-to-end | ✅ production auth paths verified: anonymous sign-in → full SP run (win → 180 ✦ → achievements), real email signups → full MP duel → winner → rematch → leaderboard, cascade delete wipes all user data |

Fixes shipped during deployment (migrations `0005`–`0007`): full-table realtime,
Index Advisor extensions, `claim_daily()` NULL-guard, `sp.submit_guess`
ambiguous-`reward` bug (winning guess used to fail with SQL 42702), and
`sp/mp.profiles → auth.users` cascade so deleting a user wipes their game data.

| **Email (Resend)** | ✅ Supabase Auth SMTP → Resend (`smtp.resend.com:465`), sender **Exotic <Exotic@DevilExotic.com>** · **13/13 custom Exotic-branded templates** (confirmation, email change, invite, magic link, reauthentication OTP, recovery + 7 security notifications) stored in `supabase/templates/emails/` · all 7 notification emails enabled · SITE_URL/redirect allow-list → devilexotic.com · verified live: real reset email delivered through Resend with the branded template |
| **In-game email loop** | ✅ `/auth/mp` now has a full forgot/reset password flow (16 locales): "Forgot password?" → branded reset email → link lands back on the site → new-password form (PASSWORD_RECOVERY session) |

| **Production deployment** | ✅ live on Vercel — **[https://devilexotic.com](https://devilexotic.com)** + **[https://www.devilexotic.com](https://www.devilexotic.com)** (project `exotic`, both domains verified, all routes 200, `/api/ai` serving, Supabase URL + anon key inlined in the bundle) |

Redeploy any time from the project directory:

```bash
npx vercel deploy --prod --token "$VERCEL_TOKEN"   # token is in .env.local
```

> **Ollama note** — the sandbox preview can't run Ollama, so `/api/ai` (and the
> deployed `ai` edge function) serve the deterministic question generator with
> `ai: false`. Run `ollama pull llama3.2` locally — or point
> `supabase secrets set OLLAMA_URL=…` at a reachable host — and real AI
> questions + Oracle hints flow automatically, no code changes needed.

---

## 1 · Supabase setup (for a fresh project)

1. Create a project at [supabase.com](https://supabase.com).
2. Push all migrations (they run in order, `0001`–`0007`):
   ```bash
   npx supabase db push --db-url 'postgresql://postgres:<PW>@<HOST>:5432/postgres' --yes
   ```
   (or run each file in `supabase/migrations/` via the SQL Editor)
3. Enable **anonymous sign-ins**: Dashboard → Authentication → Sign In / Up → *Anonymous sign-ins* → **Enable**
   (this powers the single-player device vault; multiplayer uses normal email auth).
   *(Already enabled on the live project.)*
4. Authentication → Sign In / Up → Email → turn **off** "Confirm email" for instant MP signup
   — or keep it on and configure SMTP. *(Autoconfirm is already enabled on the live project.)*

### Security architecture

- Tables live in **separated schemas**: `sp.*` and `mp.*`, exposed to PostgREST alongside `public`.
- Secret codes are stored in `sp.secrets` / `mp.secrets` / `mp.answers` — RLS enabled with
  **zero policies**, so no client can ever read them. Only `SECURITY DEFINER` RPCs can.
- Every mutation with economic or match impact is an atomic RPC
  (`start_game`, `submit_guess`, `buy_item`, `create_round`, `rematch`, …) — validated server-side.
- RLS everywhere else: own-row reads, room-membership reads, public catalogs/leaderboards.

## 2 · Environment

```bash
cp .env.local.example .env.local
```

Fill in from Dashboard → Project Settings → API:

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
OLLAMA_URL=http://127.0.0.1:11434
OLLAMA_MODEL=llama3.2
```

## 3 · Ollama (the AI engine)

```bash
ollama pull llama3.2     # or any instruct model you prefer
ollama serve             # default: http://127.0.0.1:11434
```

The Next.js server calls Ollama from `/api/ai` for:
- every multiplayer/solo **question** (math, science, trivia, riddles, logic — in the UI language),
- **The Oracle** consumable hint,
- the `ai` edge function mirrors this for cloud-side hosting (`supabase functions deploy ai`
  + `supabase secrets set OLLAMA_URL=...`).

If Ollama is unreachable, a deterministic local generator keeps the game fully playable.

## 4 · Run

```bash
npm install
npm run dev      # http://localhost:3000
```

### Optional edge functions

```bash
supabase functions deploy rotate-shop     # rotates the Featured shelf
supabase functions deploy cleanup-rooms   # prunes stale waiting rooms
```

---

## Project structure

```
app/
  page.tsx                     landing (animated digit tiles, modes, how-to)
  auth/sp                      single-player auth (anonymous vault + codename)
  auth/mp                      multiplayer auth (email/password)
  singleplayer                 hub (daily reward, difficulty, stats, leaderboard)
  singleplayer/play            the solo game (questions → clues → keypad)
  singleplayer/shop|profile    Sparks shop · solo profile
  multiplayer                  lobby (create/join/quick-match, live rooms, leaderboard)
  multiplayer/room/[code]      realtime duel room (rounds, guesses, chat, emotes)
  multiplayer/shop|profile     Novas shop · duel profile
  settings                     theme · sound · 16 languages · about
  api/ai                       Ollama proxy with fallback generator
components/                    providers (theme/i18n/toast), ui kit, codepad,
                               question card, confetti, navbar, icons
hooks/use-profiles.ts          live profile subscriptions (no refresh)
lib/                           supabase clients (2 sessions), ai, game logic, sound engine
locales/                       16 translation files (216 keys each)
supabase/
  migrations/                  0001 sp schema · 0002 mp schema · 0003 RPCs · 0004 realtime
  functions/                   ai · rotate-shop · cleanup-rooms (Deno edge functions)
```

## How a duel flows (all server-verified)

1. Host `create_room` → unique 5-char code; guest `join_room`.
2. Guest `set_ready(true)`; host `start_match` → server generates the secret code into `mp.secrets`.
3. Host client asks Ollama for a question → `create_round` (server computes a truthful clue
   from the secret and stores the correct option in the client-invisible `mp.answers`).
4. Both players `answer_round` — first correct answer scores + reveals the clue; wrong picks lock that player out of the round.
5. Either player can `submit_guess` anytime (3 each) — exact/partial feedback from the server.
6. Correct guess → `finished`, Novas + rank deltas paid atomically, achievements granted;
   host can `rematch` instantly.

No mock data, no mock users — every row is produced by real gameplay against your Supabase project.
