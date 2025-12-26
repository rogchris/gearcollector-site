// /functions/api/tarkov-news.js
// Pages Function: GET /api/tarkov-news?lang=de|en&hours=72&limit=12&q=...

export async function onRequestGet(context) {
  const { request, waitUntil } = context;
  const url = new URL(request.url);

  const lang = (url.searchParams.get("lang") || "de").toLowerCase();
  const hours = clampInt(url.searchParams.get("hours") || "72", 1, 168);
  const limit = clampInt(url.searchParams.get("limit") || "12", 1, 30);

  const q =
    url.searchParams.get("q") ||
    '"Escape from Tarkov" OR Tarkov OR Battlestate';

  const hl = lang === "de" ? "de" : "en-US";
  const gl = lang === "de" ? "DE" : "US";
  const ceid = lang === "de" ? "DE:de" : "US:en";

  const rssUrl = new URL("https://news.google.com/rss/search");
  rssUrl.searchParams.set("q", `${q} when:${hours}h`);
  rssUrl.searchParams.set("hl", hl);
  rssUrl.searchParams.set("gl", gl);
  rssUrl.searchParams.set("ceid", ceid);

  // Cache key = full request URL (inkl. Query)
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: "GET" });

  const cached = await cache.match(cacheKey);
  if (cached) return withApiHeaders(cached);

  const upstream = await fetch(rssUrl.toString(), {
    headers: {
      "User-Agent": "gearcollector.de (+https://gearcollector.de)",
      "Accept": "application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    },
  });

  if (!upstream.ok) {
    return withApiHeaders(
      json({ ok: false, error: "upstream_failed", status: upstream.status }, 502)
    );
  }

  const xml = await upstream.text();
  const items = parseRss(xml).slice(0, limit);

  const body = {
    ok: true,
    source: "google-news-rss",
    query: q,
    windowHours: hours,
    generatedAt: new Date().toISOString(),
    items,
  };

  const resp = withApiHeaders(
    json(body, 200, {
      // Browser + Edge caching (15 min)
      "Cache-Control": "public, max-age=900",
    })
  );

  waitUntil(cache.put(cacheKey, resp.clone()));
  return resp;
}

// ---- helpers ----

function clampInt(v, min, max) {
  const n = Number.parseInt(String(v), 10);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function json(obj, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

// IMPORTANT: _headers applies to static assets, NOT to Functions. :contentReference[oaicite:5]{index=5}
// Deshalb setzen wir Security-Header hier direkt.
function withApiHeaders(response) {
  const h = new Headers(response.headers);

  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("Permissions-Policy", "geolocation=(), camera=(), microphone=(), payment=()");

  // API darf nicht framed werden
  h.set("X-Frame-Options", "DENY");

  // CSP für API-JSON (minimal)
  h.set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none';");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: h,
  });
}

function parseRss(xml) {
  const items = [];
  const itemBlocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  for (const block of itemBlocks) {
    const title = decodeEntities(textOf(block, "title"));
    const link = decodeEntities(textOf(block, "link"));
    const pubDateRaw = decodeEntities(textOf(block, "pubDate"));
    const descHtml = decodeEntities(textOf(block, "description"));
    const sourceName = decodeEntities(textOf(block, "source"));

    const publishedAt = safeDate(pubDateRaw);

    items.push({
      title: title || "(untitled)",
      url: link || "",
      source: sourceName || "",
      publishedAt: publishedAt || null,
      excerpt: truncate(stripTags(descHtml).replace(/\s+/g, " ").trim(), 180),
    });
  }

  items.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
  return items;
}

function textOf(xml, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  return m[1].replace(/^<!\[CDATA\[/i, "").replace(/\]\]>$/i, "").trim();
}

function stripTags(html) {
  return String(html || "").replace(/<[^>]*>/g, "");
}

function truncate(s, max) {
  const str = String(s || "");
  if (str.length <= max) return str;
  return str.slice(0, max - 1).trimEnd() + "…";
}

function safeDate(pubDateRaw) {
  const d = new Date(pubDateRaw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function decodeEntities(s) {
  return String(s || "")
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", "\"")
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'");
}
