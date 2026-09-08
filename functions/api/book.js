/**
 * POST /api/book — booking request handler (Cloudflare Pages Function).
 *
 * Cloudflare Pages picks this up automatically from /functions — no config needed.
 *
 * Environment variables (Pages dashboard → Settings → Environment variables):
 *   RESEND_API_KEY  (secret)  API key from resend.com — enables email delivery
 *   BOOKING_TO      (plain)   where bookings are emailed, e.g. hello@yourdomain.com
 *   BOOKING_FROM    (plain)   verified sender, e.g. bookings@yourdomain.com
 *   BOOKINGS        (KV bind, optional) stores each request as a backup
 *
 * With none of these set the endpoint still returns 200 and logs the booking,
 * so the site works the moment it deploys. Add the vars when you're ready to
 * receive real emails.
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

export async function onRequestPost({ request, env }) {
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

  // Backup copy in KV, if a BOOKINGS namespace is bound.
  if (env.BOOKINGS) {
    try {
      await env.BOOKINGS.put(`booking:${ref}`, JSON.stringify(booking), {
        expirationTtl: 60 * 60 * 24 * 365,
      });
    } catch (e) {
      console.error("KV write failed", e);
    }
  }

  // Email via Resend, if configured.
  if (env.RESEND_API_KEY && env.BOOKING_TO && env.BOOKING_FROM) {
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

    try {
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
    } catch (e) {
      console.error("Resend request failed", e);
    }
  } else {
    console.log("Booking received (email not configured):", ref, JSON.stringify(booking));
  }

  return json({ ok: true, reference: ref });
}

export const onRequestOptions = () =>
  new Response(null, {
    status: 204,
    headers: { Allow: "POST, OPTIONS" },
  });

export const onRequest = () => json({ error: "Method not allowed. Use POST." }, 405);
