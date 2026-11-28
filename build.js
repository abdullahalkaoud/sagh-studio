// Builds the static site into dist/ (no dependencies; Cloudflare Workers Builds runs `node build.js`).
//   src/index.html + content/ar.json → dist/index.html
//   src/index.html + content/en.json → dist/en/index.html
//   content/projects.json            → the project cards (in place of <!--PROJECTS--> in the template)
//   src/brief/index.html + src/brief/{ar,en}.json → dist/brief/index.html, dist/en/brief/index.html (client brief)
//   src/brief/config.json            → Google Sheet endpoint + token for the brief (empty = off)
//   src/gtm.json                     → Google Tag Manager container + consent bar settings (container_id empty = off)
//   src/privacy/index.html + src/privacy/{ar,en}.md → dist/privacy/index.html, dist/en/privacy/index.html (privacy notice)
//   styles.css, main.js, consent.js, admin/, fonts/, assets/ → copied as-is
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
    // data-cta: the name consent.js sends with the cta_click dataLayer event
    const cta = (name) => ` data-cta="project_${name}"`;
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
                ? `<p class="project__links"><a class="project__link"${link}${cta("app_store")}>App Store</a><a class="project__link" href="${escape(play)}" target="_blank" rel="noopener"${cta("google_play")}>Google Play</a></p>`
                : `<a class="project__link"${link}${cta("visit")}>${escape(section.visit)}</a>`) : ""}
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

// Google Analytics 4 through Google Tag Manager, with Consent Mode v2 (card SAG-44). The ONE place to set it is
// src/gtm.json; container_id empty = off. The snippet goes at the top of <head> in every template (<!--GTM_HEAD-->).
// Consent mode "basic": the snippet only sets the defaults (all four denied) and DEFINES the loader. Nothing is
// requested from Google until SAGH_GTM.load() runs: here when a stored "granted" choice exists, or from consent.js
// when the visitor presses «أوافق». load() grants analytics_storage only; the three advertising signals stay denied.
// No <noscript> iframe: it would call Google before any choice. admin/ is copied as-is and never gets GTM.
const gtm = JSON.parse(fs.readFileSync(path.join(root, "src/gtm.json"), "utf8"));
const gtmId = String(gtm.container_id || "").trim();
if (gtmId && !/^GTM-[A-Z0-9]{4,12}$/.test(gtmId)) throw new Error('src/gtm.json: container_id must look like "GTM-XXXXXXX" (or be empty to switch GTM off)');
const consentVersion = Number(gtm.consent_version), consentDays = Number(gtm.consent_days);
if (gtmId && !(Number.isInteger(consentVersion) && consentVersion > 0 && Number.isInteger(consentDays) && consentDays > 0))
  throw new Error("src/gtm.json: consent_version and consent_days must be whole numbers above 0");
// Where "Privacy policy" links go, per language. Used by the consent bar, the footers and the brief.
const privacyLabel = { ar: "سياسة الخصوصية", en: "Privacy policy" };
const privacyHref = (lang) => {
  const href = String((gtm.privacy_href || {})[lang] || "").trim();
  if (!/^\/[\w\-/]*$/.test(href)) throw new Error(`src/gtm.json: privacy_href.${lang} must be a path on this site, like "/privacy"`);
  return href;
};
function gtmHead(lang) {
  if (!gtmId) return "";
  return `<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag("consent","default",{ad_storage:"denied",analytics_storage:"denied",ad_user_data:"denied",ad_personalization:"denied"});
gtag("set","ads_data_redaction",true);
window.SAGH_GTM={id:${JSON.stringify(gtmId)},privacy:${JSON.stringify(privacyHref(lang))},v:${consentVersion},days:${consentDays},on:false,load:function(){
gtag("consent","update",{analytics_storage:"granted"});if(this.on)return;this.on=true;
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer',this.id);}};
try{(function(c,g){if(c&&c.v===g.v&&c.choice==="granted"&&Date.now()-Date.parse(c.at)<g.days*864e5)g.load();})(JSON.parse(localStorage.getItem("sagh_consent")||"null"),SAGH_GTM);}catch(e){}
</script>`;
}
const withGtm = (html, lang) => {
  if (html.split("<!--GTM_HEAD-->").length !== 2) throw new Error(`template for "${lang}" must contain <!--GTM_HEAD--> exactly once`);
  return html.replace("<!--GTM_HEAD-->", () => gtmHead(lang));
};
console.log(`Google Tag Manager: ${gtmId ? gtmId + " (loads after consent only)" : "off"}`);

// Privacy notice: a small Markdown subset (what Legal's text uses) → HTML. Everything is escaped first.
function markdown(md, file) {
  const inline = (t) => escape(t)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*)\)/g, '<a href="$2">$1</a>')
    .replace(/(^|[\s:])(https:\/\/[^\s<]+)/g, '$1<a href="$2" target="_blank" rel="noopener" dir="ltr">$2</a>');
  const out = [];
  let list = false;
  const closeList = () => { if (list) { out.push("</ul>"); list = false; } };
  for (const raw of md.replace(/<!--[\s\S]*?-->/g, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (/^[<>|`]/.test(line)) throw new Error(`${file}: unsupported Markdown: ${line.slice(0, 40)}`);
    if (!line) { closeList(); continue; }
    let m;
    if ((m = /^- (.+)$/.exec(line))) { if (!list) { out.push("<ul>"); list = true; } out.push(`<li>${inline(m[1])}</li>`); continue; }
    closeList();
    if ((m = /^# (.+)$/.exec(line))) out.push(`<h1 class="legal__title">${inline(m[1])}</h1>`);
    else if ((m = /^## (.+)$/.exec(line))) out.push(`<h2>${inline(m[1])}</h2>`);
    else if (/^#/.test(line)) throw new Error(`${file}: unsupported heading: ${line.slice(0, 40)}`);
    else out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  return out.map((l) => "      " + l).join("\n");
}

fs.rmSync(dist, { recursive: true, force: true });
const template = fs.readFileSync(path.join(root, "src/index.html"), "utf8");
const projects = JSON.parse(fs.readFileSync(path.join(root, "content/projects.json"), "utf8")).items || [];

for (const [lang, opts] of Object.entries(languages)) {
  const content = JSON.parse(fs.readFileSync(path.join(root, `content/${lang}.json`), "utf8"));
  const data = { ...content, lang, dir: opts.dir, alt_lang: opts.alt_lang, alt_href: opts.alt_href, a11y: opts.a11y, privacy: { href: privacyHref(lang), label: privacyLabel[lang] } };
  const projectsHtml = renderProjects(projects, lookup(data, "projects", lang), lang);
  // Eyebrows are styled for spaced-out Latin caps; Arabic ones get their own style.
  const html = render(template, data, lang).replace("<!--PROJECTS-->", projectsHtml).replace(
    /<p class="eyebrow">([^<]*[\u0600-\u06FF][^<]*)<\/p>/g,
    '<p class="eyebrow eyebrow--ar">$1</p>'
  );
  const out = path.join(dist, opts.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, withGtm(html, lang));
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
    lang, dir: opts.dir, meta: strings.meta, privacy_href: privacyHref(lang), privacy_label: privacyLabel[lang],
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
  fs.writeFileSync(out, withGtm(html, lang));
  console.log(`built ${path.relative(root, out)}`);
}

// Privacy notice at /privacy and /en/privacy: src/privacy/index.html + src/privacy/<lang>.md (Legal's text).
const privacyTemplate = fs.readFileSync(path.join(root, "src/privacy/index.html"), "utf8");
const privacyDescription = { ar: "وش نجمع، وليش، ووين يروح، ومتى نحذفه، وكيف تتحكم فيه.", en: "What we collect, why, where it goes, when we delete it, and how you control it." };
for (const [lang, opts] of Object.entries(languages)) {
  const content = JSON.parse(fs.readFileSync(path.join(root, `content/${lang}.json`), "utf8"));
  const file = `src/privacy/${lang}.md`;
  const body = markdown(fs.readFileSync(path.join(root, file), "utf8"), file);
  const title = (/<h1[^>]*>(.*?)<\/h1>/.exec(body) || [])[1];
  if (!title) throw new Error(`${file}: the first line must be a "# " title`);
  const other = lang === "ar" ? "en" : "ar";
  const data = {
    lang, dir: opts.dir, content: body, title: `${title} — ${lang === "ar" ? "صاغ" : "Sagh"}`, description: privacyDescription[lang],
    home_href: lang === "ar" ? "/" : "/en/", home_aria: opts.a11y.home, sections_aria: opts.a11y.sections,
    alt_href: privacyHref(other), alt_lang: other, switch_aria: opts.a11y.switch, switch_text: lookup(content, "nav.lang", lang),
    cta: lookup(content, "nav.cta", lang), rights: lookup(content, "footer.rights", lang), year: String(new Date().getFullYear()),
    privacy_label: privacyLabel[lang],
  };
  const html = privacyTemplate.replace(/\{\{(=?)(\w+)\}\}/g, (_, raw, key) => {
    if (data[key] == null || data[key] === "") throw new Error(`src/privacy/index.html: no value for "${key}" (${lang})`);
    return raw ? data[key] : escape(data[key]);
  });
  const out = path.join(dist, privacyHref(lang).replace(/^\//, ""), "index.html");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, withGtm(html, lang));
  console.log(`built ${path.relative(root, out)}`);
}

copy("styles.css", "styles.css");
copy("main.js", "main.js");
copy("consent.js", "consent.js");
copy("admin", "admin");
copy("fonts", "fonts");
copy("assets", "assets");
console.log("copied styles.css, main.js, consent.js, admin/, fonts/, assets/");

// Product waitlist pages (cards SAG-48, SAG-49): static, no GTM, no cookies; the form posts to the waitlist Apps Script.
copy("src/hafiztha", "hafiztha");
console.log("copied src/hafiztha/ -> dist/hafiztha/");
