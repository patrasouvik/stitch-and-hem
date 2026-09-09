/**
 * Stitch & Hem — Worker entry point.
 *
 * Static files in /public are served directly by Cloudflare without invoking
 * this Worker. Anything that doesn't match a file lands here, so this only
 * needs to handle the booking API and hand everything else back to assets.
 *
 * Environment variables (Worker -> Settings -> Variables and Secrets):
 *   RESEND_API_KEY  (secret)  API key from resend.com — enables email delivery
 *   BOOKING_TO      (text)    where bookings are emailed, e.g. hello@yourdomain.com
 *   BOOKING_FROM    (text)    verified sender, e.g. bookings@yourdomain.com
 *   BOOKINGS        (KV, optional) stores each request as a backup
 *
 * With none of these set the endpoint still returns 200 and logs the booking,
 * so the site works the moment it deploys.
 */

const FIELDS = ["name", "phone", "email", "service", "items", "date", "time", "notes", "consent"];
const MAX_LEN = 1200;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

const clean = (v) => String(v ?? "").trim().slice(0, MAX_LEN);

const esc = (s) =>
  clean(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function validate(b) {
  const errors = [];
  if (!b.name) errors.push("name");
  if (!b.email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.email)) errors.push("email");
  if (!b.phone || b.phone.replace(/\D/g, "").length < 7) errors.push("phone");
  if (!b.service) errors.push("service");
  if (!b.date || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) errors.push("date");
  if (!b.time) errors.push("time");
  if (!b.consent) errors.push("consent");
  return errors;
}

async function sendEmail(env, booking, ref) {
  const rows = [
    ["Reference", ref],
    ["Name", booking.name],
    ["Phone", booking.phone],
    ["Email", booking.email],
    ["Service", booking.service],
    ["Items", booking.items || "1"],
    ["Preferred date", booking.date],
    ["Preferred time", booking.time],
    ["Notes", booking.notes || "—"],
  ]
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 14px 6px 0;color:#5C5149;white-space:nowrap">${esc(k)}</td>` +
        `<td style="padding:6px 0;font-weight:600">${esc(v)}</td></tr>`
    )
    .join("");

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.BOOKING_FROM,
      to: [env.BOOKING_TO],
      reply_to: booking.email,
      subject: `New fitting request — ${booking.name} (${booking.service})`,
      html:
        `<div style="font-family:system-ui,sans-serif;color:#2E2723">` +
        `<h2 style="color:#B5542F;margin:0 0 12px">New fitting request</h2>` +
        `<table style="border-collapse:collapse;font-size:15px">${rows}</table>` +
        `</div>`,
    }),
  });

  if (!res.ok) console.error("Resend error", res.status, await res.text());
}

async function handleBooking(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { Allow: "POST, OPTIONS" } });
  }
  if (request.method !== "POST") {
    return json({ error: "Method not allowed. Use POST." }, 405);
  }

  let raw;
  try {
    raw = await request.json();
  } catch {
    return json({ error: "Expected a JSON body." }, 400);
  }

  // Honeypot — silently accept and drop.
  if (clean(raw.company)) return json({ ok: true });

  const booking = {};
  for (const f of FIELDS) booking[f] = clean(raw[f]);

  const errors = validate(booking);
  if (errors.length) return json({ error: "Some details are missing or invalid.", fields: errors }, 422);

  booking.receivedAt = new Date().toISOString();
  booking.ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const ref = "SH-" + Date.now().toString(36).toUpperCase();

  if (env.BOOKINGS) {
    try {
      await env.BOOKINGS.put(`booking:${ref}`, JSON.stringify(booking), {
        expirationTtl: 60 * 60 * 24 * 365,
      });
    } catch (e) {
      console.error("KV write failed", e);
    }
  }

  // Name exactly which settings are missing, so a misconfiguration is obvious
  // in the logs rather than looking like "email just isn't set up".
  const missing = ["RESEND_API_KEY", "BOOKING_TO", "BOOKING_FROM"].filter((k) => !env[k]);
  const placeholder = env.BOOKING_TO && env.BOOKING_TO.startsWith("CHANGE-ME");

  if (missing.length === 0 && !placeholder) {
    try {
      await sendEmail(env, booking, ref);
    } catch (e) {
      console.error("Resend request failed", e);
    }
  } else {
    console.warn(
      placeholder
        ? `BOOKING_TO is still the placeholder — edit vars in wrangler.jsonc. Booking ${ref} NOT emailed.`
        : `Email not sent, missing: ${missing.join(", ")} (plain vars belong in wrangler.jsonc; ` +
          `secrets via 'wrangler secret put'). Booking ${ref} NOT emailed.`
    );
    console.log("Booking received:", ref, JSON.stringify(booking));
  }

  return json({ ok: true, reference: ref });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/book") {
      return handleBooking(request, env);
    }

    // Not an API route and not a matched static file — let assets decide
    // (serves 404.html if present, per not_found_handling in wrangler.jsonc).
    return env.ASSETS.fetch(request);
  },
};
