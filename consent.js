/* صاغ — cookie consent bar + dataLayer events (no dependencies). Loaded on every page except /admin.
 *
 * Analytics only (Google Analytics 4 through Google Tag Manager), and only after the visitor accepts.
 * The <head> snippet written by build.js (from src/gtm.json) runs first: it sets Google Consent Mode v2 to
 * "denied" for ad_storage, analytics_storage, ad_user_data and ad_personalization, and defines SAGH_GTM.load().
 * Nothing is requested from Google until load() runs: on page load when a stored "granted" choice exists,
 * or at the moment the visitor presses «أوافق». The three advertising signals stay "denied" always.
 * This file adds:
 *   1. the consent bar (Arabic / English from <html lang>), with «أوافق» and «أرفض» in the same weight;
 *   2. "Cookie settings" buttons ([data-cookie-settings]) that reopen the bar at any time;
 *   3. window.saghTrack(event, params): the ONLY way the site pushes events to the dataLayer.
 * Wording: legal/privacy/cookie-banner.md (Legal). If the text or the tools change, raise "consent_version"
 * in src/gtm.json so visitors are asked again.
 *
 * Events (all carry lang "ar" | "en" and page_type "home" | "brief" | "privacy"):
 *   whatsapp_click  wa_source: fab | phone_pill | contact_form | brief_retry | link
 *   cta_click       cta_name: the element's data-cta value (e.g. nav_contact, project_app_store)
 *   brief_start     first move from the brief's intro to question 1
 *   brief_submit    the brief was validated and handed to WhatsApp
 *   sagh_consent    consent_state: granted | denied (on every page once a choice exists, and when it changes)
 * Events wait in the dataLayer; Google only receives them if GTM was loaded, i.e. after consent.
 * No personal data: saghTrack keeps only the parameters listed in ALLOWED, and only short code-like values
 * (a-z, 0-9, _ and -). Names, phone numbers, link URLs and brief answers can never pass.
 */
(function () {
  "use strict";
  var KEY = "sagh_consent";          // localStorage: {"v":<consent_version>,"choice":"granted"|"denied","at":"<ISO date>"}
  var doc = document, html = doc.documentElement;
  var lang = html.lang === "en" ? "en" : "ar";
  var pageType = /\/brief\/?$/.test(location.pathname) ? "brief" : /\/privacy\/?$/.test(location.pathname) ? "privacy" : "home";
  var cfg = window.SAGH_GTM || null;  // set by the <head> snippet; null when GTM is off in src/gtm.json

  var T = {
    ar: {
      label: "موافقة الكوكيز",
      text: "نستخدم كوكيز Google Analytics عشان نعرف كيف يُستخدم الموقع ونحسّنه، وبياناتها تُعالج خارج المملكة. ما تشتغل إلا إذا وافقت.",
      privacy: "سياسة الخصوصية", accept: "أوافق", reject: "أرفض", settings: "إعدادات الكوكيز",
    },
    en: {
      label: "Cookie consent",
      text: "We use Google Analytics cookies to see how the site is used and improve it. The data is processed outside Saudi Arabia. They only run if you accept.",
      privacy: "Privacy policy", accept: "Accept", reject: "Decline", settings: "Cookie settings",
    },
  }[lang];

  /* ---------- dataLayer events ---------- */
  var ALLOWED = { wa_source: 1, cta_name: 1, consent_state: 1 };
  var CODE = /^[a-z0-9_-]{1,40}$/;
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  function track(event, params) {
    if (!CODE.test(String(event))) return;
    var out = { event: event, lang: lang, page_type: pageType };
    Object.keys(params || {}).forEach(function (k) {
      var v = String(params[k]);
      if (ALLOWED[k] && CODE.test(v)) out[k] = v;
    });
    window.dataLayer.push(out);
  }
  window.saghTrack = track;

  // One listener for every link and button: [data-cta] → cta_click; a WhatsApp link → whatsapp_click.
  // Only the data-* code is read, never the link's URL or text (a wa.me link can carry the visitor's answers).
  doc.addEventListener("click", function (e) {
    var t = e.target && e.target.closest ? e.target : null;
    if (!t) return;
    var cta = t.closest("[data-cta]");
    if (cta) track("cta_click", { cta_name: cta.getAttribute("data-cta") });
    var wa = t.closest('a[href*="wa.me"]');
    if (wa) track("whatsapp_click", { wa_source: wa.getAttribute("data-wa") || "link" });
  }, true);

  if (!cfg) return;   // GTM off: events still reach the dataLayer for testing, no bar is shown

  /* ---------- stored choice (version and lifetime come from src/gtm.json through the <head> snippet) ---------- */
  function read() {
    try {
      var c = JSON.parse(localStorage.getItem(KEY) || "null");
      if (!c || c.v !== cfg.v || (c.choice !== "granted" && c.choice !== "denied")) return null;
      if (Date.now() - Date.parse(c.at) > cfg.days * 864e5) return null;
      return c.choice;
    } catch (err) { return null; }
  }
  function save(choice) {
    try { localStorage.setItem(KEY, JSON.stringify({ v: cfg.v, choice: choice, at: new Date().toISOString() })); } catch (err) { /* private mode: asked again next visit */ }
  }
  // Removes Google Analytics cookies (_ga, _ga_<ID>) left by an earlier "accept".
  function dropAnalyticsCookies() {
    try {
      var parts = location.hostname.split("."), domains = [""];
      for (var i = 0; i < parts.length - 1; i++) domains.push("; domain=." + parts.slice(i).join("."));
      doc.cookie.split(";").forEach(function (c) {
        var name = c.split("=")[0].trim();
        if (!/^_ga(_|$)/.test(name)) return;
        domains.forEach(function (d) { doc.cookie = name + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + d; });
      });
    } catch (err) { /* nothing to remove */ }
  }
  function apply(choice) {
    if (choice === "granted") cfg.load();   // analytics_storage → granted, then the GTM loader (once)
    else { gtag("consent", "update", { analytics_storage: "denied" }); dropAnalyticsCookies(); }
    track("sagh_consent", { consent_state: choice === "granted" ? "granted" : "denied" });
  }

  /* ---------- the bar ---------- */
  var css =
    ".ck{position:fixed;z-index:60;inset-inline:0;bottom:0;display:flex;justify-content:center;padding:0 12px max(12px,env(safe-area-inset-bottom));pointer-events:none;font-family:var(--font-body,system-ui,sans-serif)}" +
    ".ck[hidden]{display:none}" +
    ".ck__box{pointer-events:auto;display:flex;align-items:center;gap:10px 20px;flex-wrap:wrap;width:100%;max-width:960px;padding:12px 14px 15px 18px;background:#fff;color:#1a1a17;border:1.5px solid #1a1a17;border-radius:20px;box-shadow:0 18px 40px -18px rgba(26,26,23,.45)}" +
    "[dir=rtl] .ck__box{padding:12px 18px 15px 14px}" +
    ".ck__text{flex:1 1 300px;margin:0;font-size:14px;line-height:1.6}" +
    ".ck__text a{color:#4f6200;font-weight:600;text-underline-offset:4px;white-space:nowrap}" +
    ".ck__btns{display:flex;gap:10px;flex:0 0 auto}" +
    /* the two choices are the same control: same size, colour and lip, so neither is pushed */
    ".ck__btn{flex:1 1 0;min-width:104px;min-height:44px;padding:0 20px;border:1.5px solid #1a1a17;border-radius:999px;background:#d1ff33;color:#1a1a17;box-shadow:0 3px 0 #a6c41a;font:700 15px/1 var(--font-body,system-ui,sans-serif);cursor:pointer;transition:transform .15s cubic-bezier(.22,1,.36,1),box-shadow .15s cubic-bezier(.22,1,.36,1)}" +
    ".ck__btn:hover{transform:translateY(-1px);box-shadow:0 4px 0 #a6c41a}" +
    ".ck__btn:active{transform:translateY(3px);box-shadow:0 0 0 #a6c41a}" +
    ".ck__btn:focus-visible,.ck__text a:focus-visible,.ck-open:focus-visible{outline:2px solid #4f6200;outline-offset:3px;border-radius:8px}" +
    ".ck__btn:focus-visible{border-radius:999px}" +
    ".ck-open{padding:6px 0;border:0;background:none;color:inherit;opacity:.7;font:500 13px/1.4 var(--font-body,system-ui,sans-serif);text-decoration:underline;text-underline-offset:4px;cursor:pointer}" +
    ".ck-open:hover{opacity:1}" +
    /* the bar takes its own room: the page, the WhatsApp button and the brief's action bar move up by its height */
    "html.has-ck body{padding-bottom:var(--ck-h,0px)}" +
    "html.has-ck .fab{bottom:calc(max(20px,env(safe-area-inset-bottom)) + var(--ck-h,0px))}" +
    "html.has-ck .actions{bottom:var(--ck-h,0px)}" +
    "@media (max-width:560px){.ck{padding-inline:8px}.ck__box,[dir=rtl] .ck__box{gap:8px;padding:10px 12px 13px;border-radius:18px}.ck__text{flex-basis:100%;font-size:12.5px;line-height:1.5}.ck__btns{flex:1 1 100%}.ck__btn{min-height:42px}}" +
    "@media (prefers-reduced-motion:reduce){.ck__btn{transition:none}.ck__btn:hover,.ck__btn:active{transform:none}}" +
    "@media print{.ck,.ck-open{display:none}}";
  var style = doc.createElement("style");
  style.textContent = css;
  doc.head.appendChild(style);

  var bar = doc.createElement("div");
  bar.className = "ck"; bar.hidden = true;
  bar.setAttribute("role", "region"); bar.setAttribute("aria-label", T.label);
  var box = doc.createElement("div"); box.className = "ck__box";
  var p = doc.createElement("p"); p.className = "ck__text"; p.id = "ck-text";
  p.appendChild(doc.createTextNode(T.text + " "));
  var a = doc.createElement("a"); a.href = cfg.privacy || "/privacy"; a.textContent = T.privacy;
  p.appendChild(a);
  var btns = doc.createElement("div"); btns.className = "ck__btns";
  function button(label, choice) {
    var b = doc.createElement("button");
    b.type = "button"; b.className = "ck__btn"; b.textContent = label;
    b.addEventListener("click", function () { save(choice); apply(choice); close(true); });
    btns.appendChild(b); return b;
  }
  var acceptBtn = button(T.accept, "granted");
  button(T.reject, "denied");
  box.appendChild(p); box.appendChild(btns); bar.appendChild(box);

  var opener = null;
  function measure() { html.style.setProperty("--ck-h", bar.hidden ? "0px" : Math.ceil(bar.getBoundingClientRect().height) + "px"); }
  function open(from) {
    opener = from || null;
    bar.hidden = false; html.classList.add("has-ck"); measure();
    if (from) acceptBtn.focus();   // reopened by the visitor: move focus to the choices
  }
  function close(restore) {
    bar.hidden = true; html.classList.remove("has-ck"); measure();
    if (restore && opener && opener.focus) opener.focus();
    opener = null;
  }

  function start() {
    doc.body.appendChild(bar);
    if (window.ResizeObserver) new ResizeObserver(measure).observe(bar);
    window.addEventListener("resize", measure);
    [].forEach.call(doc.querySelectorAll("[data-cookie-settings]"), function (b) {
      b.textContent = T.settings; b.classList.add("ck-open"); b.hidden = false;
      b.addEventListener("click", function () { open(b); });
    });
    var choice = read();
    if (choice) track("sagh_consent", { consent_state: choice });   // "granted" was already applied by the <head> snippet
    else open(null);
  }
  if (doc.body) start(); else doc.addEventListener("DOMContentLoaded", start);
})();
