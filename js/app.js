/* =========================
   Gearcollector — app.js
   DE+EN News Tabs + Worker API
   No libs. Minimal JS.
   ========================= */

(function () {
  "use strict";

  // --- Twitch parent params (must include production + local) ---
  function buildParentParams() {
    const defaults = new Set(["gearcollector.de", "www.gearcollector.de", "localhost", "127.0.0.1"]);
    const host = (window.location && window.location.hostname) ? window.location.hostname : "";
    if (host) defaults.add(host);

    return Array.from(defaults)
      .filter(Boolean)
      .map((h) => `parent=${encodeURIComponent(h)}`)
      .join("&");
  }
  const TWITCH_PARENT_PARAMS = buildParentParams();

  // === CLIPS DATA ===
  // slug from https://clips.twitch.tv/<slug>
  const CLIPS = [
    { title: "Head-eyes? Nicht heute.", slug: "", streamer: "gearcollector", game: "Escape from Tarkov", tags: ["PvP", "Tarkov"] },
    { title: "Grenade-Science (funktioniert… meistens)", slug: "", streamer: "gearcollector", game: "Escape from Tarkov", tags: ["Nades", "Fail"] },
    { title: "Audio-Phantom vs. Realität", slug: "", streamer: "gearcollector", game: "Escape from Tarkov", tags: ["Audio", "Clip"] },
    { title: "Loot-Greed endet wie erwartet", slug: "", streamer: "gearcollector", game: "Escape from Tarkov", tags: ["Loot", "Tarkov"] },
    { title: "Squad callout: sauber oder Chaos", slug: "", streamer: "gearcollector", game: "Escape from Tarkov", tags: ["Squad", "Comms"] },
    { title: "One-tap mit Timing", slug: "", streamer: "gearcollector", game: "Escape from Tarkov", tags: ["Aim", "Highlight"] },
  ];

  // === NEWS FALLBACKS (falls API down) ===
  const NEWS_FALLBACK_DE = [
    {
      title: "Fallback: Patch/Hotfix (manuell)",
      date: "2025-12-20",
      sourceLabel: "Gearcollector",
      url: "",
      excerpt: "API nicht erreichbar? Dann laufen wir mit statischem Backup, statt leerer Seite.",
      tags: ["Fallback"],
    },
  ];

  const NEWS_FALLBACK_EN = [
    {
      title: "Fallback: Patch/Hotfix (manual)",
      date: "2025-12-20",
      sourceLabel: "Gearcollector",
      url: "",
      excerpt: "API down? We keep a backup so the page never looks dead.",
      tags: ["Fallback"],
    },
  ];

  // --- DOM helpers ---
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v === null || v === undefined) continue;
      else node.setAttribute(k, String(v));
    }
    for (const child of children) node.append(child);
    return node;
  }

  function formatDate(isoOrDateString, locale = "de-DE") {
    if (!isoOrDateString) return "";
    const d = new Date(isoOrDateString);
    if (Number.isNaN(d.getTime())) return String(isoOrDateString);
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }

  // --- Twitch clip URLs ---
  function twitchClipEmbedUrl(slug) {
    const base = "https://clips.twitch.tv/embed";
    const params = [
      `clip=${encodeURIComponent(slug)}`,
      TWITCH_PARENT_PARAMS,
      "autoplay=false",
      "muted=true",
    ].join("&");
    return `${base}?${params}`;
  }
  function twitchClipPageUrl(slug) {
    return `https://clips.twitch.tv/${encodeURIComponent(slug)}`;
  }

  // --- Render Clips ---
  function renderClips() {
    const grid = document.getElementById("clips-grid");
    if (!grid) return;

    grid.innerHTML = "";
    CLIPS.forEach((c) => {
      const hasSlug = Boolean(c.slug && c.slug.trim().length > 0);

      const media = el("div", { class: "media" }, [
        hasSlug
          ? el("iframe", {
              title: `Twitch Clip: ${c.title}`,
              src: twitchClipEmbedUrl(c.slug.trim()),
              loading: "lazy",
              allowfullscreen: "true",
              referrerpolicy: "strict-origin-when-cross-origin",
            })
          : el("div", { class: "media-placeholder" }, [
              el("div", { class: "placeholder-inner" }, [
                el("div", { class: "badge", text: "Clip-Slug fehlt" }),
                el("div", { text: "Trag den Twitch Clip-Slug in assets/app.js ein." }),
              ]),
            ]),
      ]);

      const title = el("h3", { class: "item-title", text: c.title });
      const meta = el("div", { class: "item-meta", text: `${c.game} • @${c.streamer}` });
      const tags = el("div", { class: "tagrow" }, (c.tags || []).map(t => el("span", { class: "tag", text: t })));

      const actions = el("div", { class: "item-actions" }, [
        el("a", {
          class: "link",
          href: hasSlug ? twitchClipPageUrl(c.slug.trim()) : "#",
          target: hasSlug ? "_blank" : null,
          rel: hasSlug ? "noopener noreferrer" : null,
          "aria-disabled": hasSlug ? "false" : "true",
          text: "Auf Twitch öffnen ↗",
        }),
        el("a", {
          class: "link",
          href: "https://twitch.tv/gearcollector",
          target: "_blank",
          rel: "noopener noreferrer",
          text: "Zum Channel ↗",
        }),
      ]);

      const card = el("article", { class: "card item", "data-reveal": "" }, [
        media,
        el("div", { class: "item-head" }, [title, meta]),
        tags,
        actions,
      ]);

      grid.append(card);
    });

    const stat = document.getElementById("stat-clips");
    if (stat) stat.textContent = String(CLIPS.length);
  }

  // --- Worker API -> News ---
  async function loadNews(lang /* "de" | "en" */) {
    const endpoint = `/api/tarkov-news?lang=${encodeURIComponent(lang)}&hours=72&limit=12`;

    try {
      const res = await fetch(endpoint, { headers: { "Accept": "application/json" } });
      if (!res.ok) throw new Error(`news api ${res.status}`);
      const data = await res.json();

      if (!data?.ok || !Array.isArray(data.items)) throw new Error("bad payload");

      // Normalize
      return data.items.map((x) => ({
        title: x.title || "(untitled)",
        url: x.url || "",
        source: x.source || "",
        publishedAt: x.publishedAt || null,
        excerpt: x.excerpt || "",
      }));
    } catch {
      // Fallback
      const fb = (lang === "de") ? NEWS_FALLBACK_DE : NEWS_FALLBACK_EN;
      return fb.map((n) => ({
        title: n.title,
        url: n.url,
        source: n.sourceLabel,
        publishedAt: n.date,
        excerpt: n.excerpt,
        tags: n.tags || [],
        _fallback: true,
      }));
    }
  }

  function renderNewsItems(gridEl, items, lang) {
    if (!gridEl) return;
    gridEl.innerHTML = "";

    const locale = (lang === "de") ? "de-DE" : "en-US";

    items.forEach((n) => {
      const date = formatDate(n.publishedAt, locale);
      const metaText = [date, n.source].filter(Boolean).join(" • ");

      const head = el("div", { class: "item-head" }, [
        el("h3", { class: "item-title", text: n.title }),
        el("div", { class: "item-meta", text: metaText }),
      ]);

      const excerpt = el("p", { class: "muted", text: n.excerpt || "" });
      excerpt.style.margin = "0";

      const actions = el("div", { class: "item-actions" }, [
        el("a", {
          class: "link",
          href: n.url ? n.url : "#",
          target: n.url ? "_blank" : null,
          rel: n.url ? "noopener noreferrer" : null,
          "aria-disabled": n.url ? "false" : "true",
          text: n.url ? ((lang === "de") ? "Quelle öffnen ↗" : "Open source ↗") : ((lang === "de") ? "Quelle fehlt" : "No source"),
        }),
      ]);

      const card = el("article", { class: "card item", "data-reveal": "" }, [
        head,
        excerpt,
        actions,
      ]);

      gridEl.append(card);
    });
  }

  // --- Accessible Tabs (DE/EN) ---
  function setupTabs() {
    const tabDe = document.getElementById("tab-news-de");
    const tabEn = document.getElementById("tab-news-en");
    const panelDe = document.getElementById("panel-news-de");
    const panelEn = document.getElementById("panel-news-en");

    if (!tabDe || !tabEn || !panelDe || !panelEn) return;

    function activate(which) {
      const isDe = which === "de";

      tabDe.setAttribute("aria-selected", isDe ? "true" : "false");
      tabEn.setAttribute("aria-selected", isDe ? "false" : "true");

      tabDe.tabIndex = isDe ? 0 : -1;
      tabEn.tabIndex = isDe ? -1 : 0;

      panelDe.hidden = !isDe;
      panelEn.hidden = isDe;

      panelDe.classList.toggle("is-active", isDe);
      panelEn.classList.toggle("is-active", !isDe);
    }

    function onKeyDown(e) {
      // Left/Right switch, Enter/Space activate
      const key = e.key;
      const isOnDe = (document.activeElement === tabDe);
      const isOnEn = (document.activeElement === tabEn);

      if (key === "ArrowRight" || key === "ArrowLeft") {
        e.preventDefault();
        if (isOnDe) tabEn.focus();
        else tabDe.focus();
        return;
      }

      if (key === "Enter" || key === " ") {
        e.preventDefault();
        if (isOnDe) activate("de");
        if (isOnEn) activate("en");
      }
    }

    tabDe.addEventListener("click", () => activate("de"));
    tabEn.addEventListener("click", () => activate("en"));
    tabDe.addEventListener("keydown", onKeyDown);
    tabEn.addEventListener("keydown", onKeyDown);

    activate("de");
  }

  // --- Scroll reveal ---
  function setupReveal() {
    const nodes = document.querySelectorAll("[data-reveal]");
    if (!nodes.length) return;

    const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      nodes.forEach(n => n.classList.add("is-inview"));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-inview");
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });

    nodes.forEach((n) => io.observe(n));
  }

  async function boot() {
    const y = document.getElementById("year");
    if (y) y.textContent = String(new Date().getFullYear());

    setupTabs();
    renderClips();

    // Load DE+EN in parallel
    const [deItems, enItems] = await Promise.all([loadNews("de"), loadNews("en")]);

    const gridDe = document.getElementById("news-grid-de");
    const gridEn = document.getElementById("news-grid-en");

    renderNewsItems(gridDe, deItems, "de");
    renderNewsItems(gridEn, enItems, "en");

    const stat = document.getElementById("stat-news");
    if (stat) stat.textContent = `${deItems.length} / ${enItems.length}`;

    setupReveal();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
