# Stitch & Hem — alterations business website

A single-page marketing site with an online booking form. Static HTML, no build step, no runtime dependencies. Deploys to **Cloudflare Workers** using Static Assets, with the booking endpoint handled by the Worker.

```
stitch-and-hem/
├── public/               ← static assets, served directly by Cloudflare
│   ├── index.html        ← the whole site (HTML + CSS + JS in one file)
│   ├── _headers          ← security headers and cache rules
│   ├── robots.txt
│   └── sitemap.xml
├── src/index.js          ← Worker: handles POST /api/book, defers rest to assets
├── wrangler.jsonc        ← Worker + assets configuration
└── .dev.vars.example     ← template for local secrets
```

## How the routing works

Cloudflare serves anything in `public/` directly, without running the Worker. Only requests that don't match a file reach `src/index.js` — which handles `/api/book` and hands everything else back to the assets binding. So the static site costs no Worker invocations, and the API is a single file.

## Deploying

The Worker is already connected to this GitHub repo, so **pushing to `main` deploys**. Cloudflare runs `npx wrangler deploy`, which reads `wrangler.jsonc`, uploads `public/` and publishes `src/index.js` together as one unit.

Deploy from your machine instead with:

```bash
npm install
npx wrangler deploy
```

### Dashboard build settings

If you ever recreate the project, these are the settings that matter (Worker → Settings → Build):

| Field | Value |
|---|---|
| Build command | *leave empty* |
| Deploy command | `npx wrangler deploy` |
| Root directory | `/` |

The `name` in `wrangler.jsonc` must match the Worker's name, or you'll deploy to a second, separate Worker.

## Attaching your domain

Worker → **Domains** (or **Settings → Domains & Routes**) → **Add** → **Custom domain** → enter your domain. Add `www.` as a second entry if you want both. Since the domain is already in your Cloudflare account, DNS and TLS are handled automatically — usually live in a couple of minutes.

Then update the three placeholders that still say `example.com`:

- `public/index.html` — the `<link rel="canonical">` tag
- `public/robots.txt` — the `Sitemap:` line
- `public/sitemap.xml` — the `<loc>` value

## Making the booking form email you

Until you configure this, submissions are accepted and written to the Worker log — visible under **Observability → Logs**, or live with `npx wrangler tail`. The form works; you just have to go looking for the entries. To get emails:

1. Sign up at [resend.com](https://resend.com), verify your domain, create an API key
2. Worker → **Settings** → **Variables and Secrets** → add:

   | Name | Type | Value |
   |---|---|---|
   | `RESEND_API_KEY` | Secret | your `re_...` key |
   | `BOOKING_TO` | Text | where bookings should land |
   | `BOOKING_FROM` | Text | a sender on your verified domain |

3. Redeploy so the values are picked up

**Optional backup copy.** Create a KV namespace (Storage & Databases → KV), then uncomment the `kv_namespaces` block in `wrangler.jsonc` and paste the namespace id. Every submission is then also stored under `booking:<ref>` for a year, so nothing is lost if an email bounces.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in if you want to test emails
npm run dev                      # http://localhost:8787
```

`wrangler dev` serves the static files and runs the Worker together, so the booking form works locally exactly as it does in production.

To watch production logs: `npm run tail`.

## Making it yours

Everything visual is in `public/index.html`.

**Business details** — search for these and replace throughout: `Stitch & Hem`, `12 Market Street`, `020 7946 0123`, `hello@example.com`, the opening hours in the *Visit us* section, and the `application/ld+json` block near the top (that block is what Google reads for your business listing, so keep it in step with the visible text).

**Colours** — the `:root` block at the top of the `<style>` section:

```css
--terracotta: #B5542F;   /* buttons, accents */
--sage:       #6E8A6B;   /* "How it works" band */
--cream:      #FDF6EE;   /* page background */
--ink:        #2E2723;   /* body text */
```

**Services and prices** — the six `.card` blocks in the `#services` section.

**Reviews** — the three `.quote` blocks. Use real ones.

**Photos** — the gallery holds inline SVG placeholders. For real photos, drop them in `public/img/` and replace each `<svg>…</svg>` inside a `.shot` figure with:

```html
<img src="/img/suit-sleeves.webp" alt="Suit jacket sleeves shortened by 4cm" width="800" height="600" loading="lazy">
```

Export around 800×600 as WebP, under ~150KB each.

**Booking form fields** — the `<form class="booking">` block. If you add a field, add its `name` to the `FIELDS` array in `src/index.js` too, otherwise it will be dropped.

**A custom 404** — add `public/404.html`; `not_found_handling` in `wrangler.jsonc` is already set to serve it.

## Notes

- Validation runs client-side for fast feedback *and* in the Worker, so the endpoint is safe even if someone posts to it directly.
- The form blocks Sundays and same-day bookings, and only accepts dates within the next 90 days. Adjust in the `<script>` block at the bottom of `index.html`.
- A hidden honeypot field catches basic spam bots. If real spam appears, add [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/) — free, and a few lines to integrate.
- `_headers` rules apply to static files only. Worker responses set their own headers in `src/index.js`.

## Licence

Private project. Use it however you like.
