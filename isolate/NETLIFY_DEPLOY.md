# Deploying Exotic to Netlify

The game is a server-rendered Next.js 16 app (API routes + SSR pages), so
Netlify needs **three things** or every route shows "page couldn't load":

1. `netlify.toml` with the **@netlify/plugin-nextjs** runtime → ✅ in this repo
2. **Environment variables** set BEFORE the build → see below
3. Deploy from **Git** (or Netlify CLI) — a drag-and-drop of files cannot
   work for an SSR app

---

## Option A — Dashboard + GitHub (recommended)

1. Push this project to a GitHub repo (include `netlify.toml`).
2. Netlify → **Add new site → Import an existing project** → pick the repo.
3. Netlify auto-detects Next.js (the `netlify.toml` pins it anyway):
   - Build command: `npm run build`
   - Publish directory: `.next`
4. **Before the first deploy**, add environment variables:
   **Site configuration → Environment variables** → paste these
   (exact values are in `env.netlify.txt` in this project root):

   | Variable | Needed by |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | client (inlined at BUILD time) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client (inlined at BUILD time) |
   | `SUPABASE_SERVICE_ROLE` | email API routes |
   | `POSTGRES_URL` | email API routes |
   | `RESEND_API_KEY` | reset emails |
   | `RESEND_FROM` | reset emails |
   | `OPENROUTER_API_KEY` | Exo (AI) |
   | `OPENROUTER_MODEL` | Exo (AI) |
   | `OPENROUTER_REFERER` (optional) | OpenRouter attribution |

   Or import them in one shot with the CLI:
   ```
   netlify link
   netlify env:import env.netlify.txt
   ```
5. **Deploy site**. First build takes ~1–2 minutes.

## Option B — Netlify CLI from your machine

```
npm i -g netlify-cli
netlify login
cd exotic
netlify init        # link/create the site
netlify env:import env.netlify.txt
netlify deploy --build --prod
```

---

## Custom domain (whenever you're ready)

DNS is at IONOS (nameservers `a.ns36.de` / `b.ns36.de`):
- Netlify → Domain management → Add domain `devilexotic.com`
- At IONOS, point `A @` → Netlify's load balancer `75.2.60.5`
  (or just change the nameservers to Netlify's and let it manage DNS —
  but that would move the existing email MX records, so the A-record
  route is safer while email stays on domcollect)

## Notes

- Supabase (auth/DB/realtime), Resend, and OpenRouter all work from
  Netlify's serverless functions — no changes needed.
- After deploying, run through: signup → Solo → Duel register → a room —
  if anything fails, check **Deploys → Function logs**.
