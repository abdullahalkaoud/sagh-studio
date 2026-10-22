// Builds the static site into dist/ (no dependencies; runs on Netlify with `node build.js`).
//   src/index.html + content/ar.json → dist/index.html
//   src/index.html + content/en.json → dist/en/index.html
//   styles.css, main.js, admin/      → copied as-is
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

function copy(from, to) {
  const src = path.join(root, from);
  const dest = path.join(dist, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

fs.rmSync(dist, { recursive: true, force: true });
const template = fs.readFileSync(path.join(root, "src/index.html"), "utf8");

for (const [lang, opts] of Object.entries(languages)) {
  const content = JSON.parse(fs.readFileSync(path.join(root, `content/${lang}.json`), "utf8"));
  const data = { ...content, lang, dir: opts.dir, alt_lang: opts.alt_lang, alt_href: opts.alt_href, a11y: opts.a11y };
  const html = render(template, data, lang);
  const out = path.join(dist, opts.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  console.log(`built ${path.relative(root, out)}`);
}

copy("styles.css", "styles.css");
copy("main.js", "main.js");
copy("admin", "admin");
console.log("copied styles.css, main.js, admin/");
