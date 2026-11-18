// Builds the static site into dist/ (no dependencies; Cloudflare Workers Builds runs `node build.js`).
//   src/index.html + content/ar.json → dist/index.html
//   src/index.html + content/en.json → dist/en/index.html
//   content/projects.json            → the project cards (in place of <!--PROJECTS--> in the template)
//   src/brief/index.html + src/brief/{ar,en}.json → dist/brief/index.html, dist/en/brief/index.html (client brief)
//   src/brief/config.json            → Google Sheet endpoint + token for the brief (empty = off)
//   styles.css, main.js, admin/, fonts/, assets/ → copied as-is
const fs = require("fs");
const path = require("path");

const root = __dirname;
const dist = path.join(root, "dist");

const languages = {
  ar: {
    dir: "rtl", out: "index.html", alt_lang: "en", alt_href: "/en/",
    a11y: {
      home: "صاغ — الصفحة الرئيسية", sections: "الأقسام", switch: "English",
      services: "خدماتنا", statement: "رؤيتنا", whatsapp: "تواصل عبر واتساب",
    },
  },
  en: {
    dir: "ltr", out: "en/index.html", alt_lang: "ar", alt_href: "/",
    a11y: {
      home: "Sagh — home", sections: "Sections", switch: "العربية",
      services: "Our services", statement: "Our view", whatsapp: "Chat on WhatsApp",
    },
  },
};

const escape = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function lookup(data, key, lang) {
  const value = key.split(".").reduce((v, part) => (v == null ? undefined : v[part]), data);
  if (value == null || value === "") throw new Error(`content/${lang}.json: missing "${key}"`);
  return value;
}

function render(template, data, lang) {
  return template.replace(/\{\{\s*([\w.]+)(\|pipe)?\s*\}\}/g, (_, key, pipe) => {
    const value = lookup(data, key, lang);
    if (pipe) {
      if (!Array.isArray(value)) throw new Error(`content/${lang}.json: "${key}" must be a list`);
      return escape(value.join("|"));
    }
    return escape(value);
  });
}

// Project cards. Each item carries both languages (title_ar / title_en, …); shared fields
// (year, url, image) are written once. An empty list removes the whole section.
function renderProjects(projects, section, lang) {
  if (!projects.length) return "";
  const color = (c) => (/^#[0-9a-f]{3,8}$/i.test(c || "") ? c : "#f4f2ee");
  const cards = projects.map((p, i) => {
    const pick = (field) => p[`${field}_${lang}`] || p[`${field}_ar`] || "";
    const title = pick("title");
    if (!title) throw new Error(`content/projects.json: project ${i + 1} has no title`);
    // status: "live" shows the link (needs a URL); "soon" / "closed" show a tag instead.
    // Older entries without a status count as live when they have a URL.
    const status = ["live", "soon", "closed"].includes(p.status) ? p.status : "live";
    const url = status === "live" ? (p.url || "").trim() : "";
    // url_play: optional Google Play link for apps. When set, the card shows two store links
    // (url as "App Store", url_play as "Google Play") instead of "Visit project".
    const play = url ? (p.url_play || "").trim() : "";
    const link = url ? ` href="${escape(url)}" target="_blank" rel="noopener"` : "";
    const media = p.image
      ? `<img src="${escape(p.image)}" alt="${escape(title)}" loading="lazy" decoding="async" />`
      : `<span class="project__initial">${escape(title.slice(0, 1))}</span>`;
    const tag = url ? "a" : "div";
    const badge = status !== "live" ? `<span class="project__status" data-status="${status}">${escape(section[`status_${status}`])}</span>` : "";
    return `
          <article class="project reveal">
            <${tag} class="project__media" data-fit="${p.image_fit === "contain" ? "contain" : "cover"}" style="--media-bg: ${color(p.image_bg)}"${link}${url ? ` aria-label="${escape(title)}"` : ""}>${media}${badge}</${tag}>
            <div class="project__body">
              <p class="project__meta"><span>${escape(pick("category"))}</span>${p.year ? `<span class="project__year">${escape(p.year)}</span>` : ""}</p>
              <h3 class="project__title">${escape(title)}</h3>
              ${pick("summary") ? `<p class="project__text">${escape(pick("summary"))}</p>` : ""}
              ${url ? (play
                ? `<p class="project__links"><a class="project__link"${link}>App Store</a><a class="project__link" href="${escape(play)}" target="_blank" rel="noopener">Google Play</a></p>`
                : `<a class="project__link"${link}>${escape(section.visit)}</a>`) : ""}
            </div>
          </article>`;
  }).join("");
  return `
    <section class="projects" id="work" aria-labelledby="projectsTitle">
      <div class="container">
        <div class="section-head reveal">
          <p class="eyebrow">${escape(section.eyebrow)}</p>
          <h2 id="projectsTitle" class="section-title">${escape(section.title)}</h2>
          <p class="section-sub">${escape(section.text)}</p>
        </div>
        <div class="projects__grid">${cards}
        </div>
      </div>
    </section>`;
}

function copy(from, to) {
  const src = path.join(root, from);
  const dest = path.join(dist, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

fs.rmSync(dist, { recursive: true, force: true });
const template = fs.readFileSync(path.join(root, "src/index.html"), "utf8");
const projects = JSON.parse(fs.readFileSync(path.join(root, "content/projects.json"), "utf8")).items || [];

for (const [lang, opts] of Object.entries(languages)) {
  const content = JSON.parse(fs.readFileSync(path.join(root, `content/${lang}.json`), "utf8"));
  const data = { ...content, lang, dir: opts.dir, alt_lang: opts.alt_lang, alt_href: opts.alt_href, a11y: opts.a11y };
  const projectsHtml = renderProjects(projects, lookup(data, "projects", lang), lang);
  // Eyebrows are styled for spaced-out Latin caps; Arabic ones get their own style.
  const html = render(template, data, lang).replace("<!--PROJECTS-->", projectsHtml).replace(
    /<p class="eyebrow">([^<]*[\u0600-\u06FF][^<]*)<\/p>/g,
    '<p class="eyebrow eyebrow--ar">$1</p>'
  );
  const out = path.join(dist, opts.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`built ${path.relative(root, out)}`);
}

// Client brief form at /brief (Arabic) and /en/brief (English), noindex; we send its link to leads.
// One template (src/brief/index.html) + one string table per language (src/brief/ar.json, en.json).
// On submit the page opens WhatsApp with the answers, so the number comes from main.js (one place to change it).
const waNumber = (fs.readFileSync(path.join(root, "main.js"), "utf8").match(/WHATSAPP_NUMBER\s*=\s*"(\d+)"/) || [])[1];
if (!waNumber) throw new Error('main.js: WHATSAPP_NUMBER not found (needed by src/brief/index.html)');
const briefTemplate = fs.readFileSync(path.join(root, "src/brief/index.html"), "utf8");
// Google Sheet copy of each brief: the ONE place to set it is src/brief/config.json (see its "_help").
// Both values empty = off. Checked here so a typo fails the build instead of silently losing rows.
const sheet = JSON.parse(fs.readFileSync(path.join(root, "src/brief/config.json"), "utf8"));
const sheetEndpoint = String(sheet.sheet_endpoint || "").trim(), sheetToken = String(sheet.sheet_token || "").trim();
if (!!sheetEndpoint !== !!sheetToken)
  throw new Error("src/brief/config.json: set both sheet_endpoint and sheet_token, or leave both empty");
if (sheetEndpoint && !/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(sheetEndpoint))
  throw new Error("src/brief/config.json: sheet_endpoint must look like https://script.google.com/macros/s/<id>/exec");
if (sheetToken && !/^[A-Za-z0-9_-]{16,128}$/.test(sheetToken))
  throw new Error("src/brief/config.json: sheet_token must be 16-128 letters, digits, - or _");
console.log(`brief → Google Sheet: ${sheetEndpoint ? "ON" : "off"}`);
const briefLangs = {
  ar: { dir: "rtl", out: "brief/index.html", fonts: ["ibm-plex-sans-arabic-400.woff2", "alexandria.woff2"] },
  en: { dir: "ltr", out: "en/brief/index.html", fonts: ["bricolage-grotesque.woff2", "jetbrains-mono.woff2"] },
};
// Both string tables must have the same keys, so an edit in one language cannot be forgotten in the other.
const keyPaths = (v, p = "") =>
  v && typeof v === "object" && !Array.isArray(v)
    ? Object.keys(v).flatMap((k) => keyPaths(v[k], p ? `${p}.${k}` : k))
    : [Array.isArray(v) ? `${p}[${v.length}]` : p];
const briefStrings = Object.fromEntries(Object.keys(briefLangs).map((lang) =>
  [lang, JSON.parse(fs.readFileSync(path.join(root, `src/brief/${lang}.json`), "utf8"))]));
const arKeys = new Set(keyPaths(briefStrings.ar)), enKeys = new Set(keyPaths(briefStrings.en));
const keyDiff = [...arKeys].filter((k) => !enKeys.has(k)).concat([...enKeys].filter((k) => !arKeys.has(k)));
if (keyDiff.length) throw new Error(`src/brief/ar.json and en.json differ in: ${keyDiff.join(", ")}`);

for (const [lang, opts] of Object.entries(briefLangs)) {
  const strings = briefStrings[lang];
  const data = {
    lang, dir: opts.dir, meta: strings.meta,
    preload: opts.fonts.map((f) => `<link rel="preload" href="/fonts/${f}" as="font" type="font/woff2" crossorigin>`).join("\n"),
  };
  // string table as a JS literal; "<" escaped so no text can close the <script> tag
  const json = JSON.stringify(strings).replace(/</g, "\\u003c");
  const html = briefTemplate
    .replace(/\{\{(=?)([\w.]+)\}\}/g, (_, raw, key) => {
      const value = key.split(".").reduce((v, part) => (v == null ? undefined : v[part]), data);
      if (value == null || value === "") throw new Error(`src/brief/${lang}.json: missing "${key}"`);
      return raw ? value : escape(value);
    })
    .replace("/*__STRINGS__*/{}", () => json)
    .replace(/__WHATSAPP_NUMBER__/g, waNumber)
    .replace('"__SHEET_ENDPOINT__"', () => JSON.stringify(sheetEndpoint))
    .replace('"__SHEET_TOKEN__"', () => JSON.stringify(sheetToken));
  const out = path.join(dist, opts.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`built ${path.relative(root, out)}`);
}

copy("styles.css", "styles.css");
copy("main.js", "main.js");
copy("admin", "admin");
copy("fonts", "fonts");
copy("assets", "assets");
console.log("copied styles.css, main.js, admin/, fonts/, assets/");
