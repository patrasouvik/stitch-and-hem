# Stitch & Hem — alterations business website

A single-page marketing site with an online booking form. Static HTML, no build step, no dependencies. Deploys to Cloudflare Pages and serves the booking form through a Pages Function.

```
stitch-and-hem/
├── public/              ← everything served to visitors
│   ├── index.html       ← the whole site (HTML + CSS + JS in one file)
│   ├── _headers         ← security headers and cache rules
│   ├── robots.txt
│   └── sitemap.xml
├── functions/api/book.js ← receives booking submissions
├── package.json          ← optional: local preview + CLI deploy
└── .dev.vars.example     ← template for local secrets
```

## 1. Put it on GitHub

```bash
cd stitch-and-hem
git init -b main
git add .
git commit -m "Alterations site: marketing page and booking form"
gh repo create stitch-and-hem --private --source=. --push
```

No `gh` CLI? Create an empty repo on github.com, then:

```bash
git remote add origin git@github.com:YOUR-USERNAME/stitch-and-hem.git
git push -u origin main
```

## 2. Connect Cloudflare Pages

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Authorise GitHub and pick `stitch-and-hem`
3. Build settings:
   - Framework preset: **None**
   - Build command: *leave empty*
   - Build output directory: `public`
4. **Save and Deploy**

You'll get a `*.pages.dev` URL in under a minute. Every push to `main` redeploys automatically.

## 3. Point your domain at it

In the Pages project → **Custom domains** → **Set up a custom domain** → enter your domain (and `www.` as a second entry if you want both). Because the domain is already in your Cloudflare account, the DNS records are created for you and TLS is issued automatically — usually live within a couple of minutes.

Then update these three placeholders to your real domain:

- `public/index.html` — the `<link rel="canonical">` tag
- `public/robots.txt` — the `Sitemap:` line
- `public/sitemap.xml` — the `<loc>` value

## 4. Make the booking form email you

Until you configure this, submissions are accepted and written to the function log (Pages project → **Logs**) — the form works, you just have to go look for the entries. To get emails:

1. Sign up at [resend.com](https://resend.com), verify your domain, create an API key
2. Pages project → **Settings** → **Environment variables** → add for **Production**:

   | Name | Type | Value |
   |---|---|---|
   | `RESEND_API_KEY` | Secret | your `re_...` key |
   | `BOOKING_TO` | Text | where bookings should land |
   | `BOOKING_FROM` | Text | a sender on your verified domain |

3. Redeploy (Deployments → **Retry deployment**) so the variables take effect

**Optional backup copy.** Create a KV namespace (Workers & Pages → **KV** → Create), then in Pages → Settings → **Bindings** → add a KV binding named `BOOKINGS`. Every submission is then also stored under `booking:<ref>` for a year, so nothing is lost if an email bounces.

## 5. Local preview

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in if you want to test emails
npm run dev                      # http://localhost:8788
```

Or, for the page alone with no function: `npx serve public`.

## Making it yours

Everything is in `public/index.html`. The things you'll want to change:

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

**Photos** — the gallery currently holds inline SVG placeholders. To use real photos, drop them in `public/img/` and replace each `<svg>…</svg>` inside a `.shot` figure with:

```html
<img src="/img/suit-sleeves.webp" alt="Suit jacket sleeves shortened by 4cm" width="800" height="600" loading="lazy">
```

Export at roughly 800×600 as WebP and keep each under ~150KB. Then add `img-src 'self' data:;` targets as needed in `_headers` if you ever load images from another domain.

**Booking form fields** — the `<form class="booking">` block. If you add a field, add its `name` to the `FIELDS` array in `functions/api/book.js` too, otherwise it will be dropped.

## Notes

- Validation runs client-side for fast feedback *and* server-side in the function, so the endpoint is safe even if someone posts to it directly.
- The form blocks Sundays and same-day bookings, and only accepts dates within the next 90 days. Adjust in the `<script>` block at the bottom of `index.html`.
- A hidden honeypot field catches basic spam bots. If you start seeing real spam, add Cloudflare Turnstile — it's free and integrates in a few lines.
- The date input uses the visitor's browser locale, so it shows the right format automatically.

## Licence

Private project. Use it however you like.
