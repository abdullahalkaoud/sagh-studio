/* صاغ — interactions (no dependencies) */

// ضع رقم واتساب هنا بالصيغة الدولية بدون + أو أصفار بادئة، مثل: 9665XXXXXXXX
// إذا تُرك فارغاً، يفتح واتساب ويطلب من الزائر اختيار جهة الاتصال.
const WHATSAPP_NUMBER = "966558000321";

const root = document.documentElement;
root.classList.remove("no-js");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const finePointer = window.matchMedia("(pointer: fine)");
const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

/* ---------- Splash ---------- */
(() => {
  const splash = document.getElementById("splash");
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    splash.classList.add("is-done");
    document.body.classList.remove("is-loading");
    window.removeEventListener("keydown", finish);
  };
  if (reducedMotion.matches) return finish();
  splash.addEventListener("click", finish);
  window.addEventListener("keydown", finish);
  setTimeout(finish, 2000);
})();

/* ---------- Hero + transparent cube ---------- */
(() => {
  const section = document.querySelector(".flip-section");
  const stage = section.querySelector(".stage");
  const captions = [...section.querySelectorAll(".caption")];
  const pill = document.getElementById("scrollPill");

  // One stop per caption. Values are cube rotations in degrees.
  // Last stop tumbles forward onto the top face (ry -360 keeps it upright).
  const stops = [
    { rx: 0, ry: 0 },      // front — صاغ
    { rx: 0, ry: -90 },    // right — ID
    { rx: 0, ry: -180 },   // back  — WEB
    { rx: 0, ry: -270 },   // left  — APP
    { rx: -90, ry: -360 }, // top   — one team
  ];
  const last = stops.length - 1;

  let ticking = false;

  function update() {
    ticking = false;
    const rect = section.getBoundingClientRect();
    const travel = section.offsetHeight - window.innerHeight;
    const p = clamp(-rect.top / travel);
    const t = p * last; // 0..last

    // Rotation: hold on each face, ease between them.
    let rx, ry;
    if (reducedMotion.matches) {
      const s = stops[Math.round(t)];
      rx = s.rx; ry = s.ry;
    } else {
      const i = Math.min(Math.floor(t), last - 1);
      const e = smooth(clamp((t - i - 0.3) / 0.4));
      rx = lerp(stops[i].rx, stops[i + 1].rx, e);
      ry = lerp(stops[i].ry, stops[i + 1].ry, e);
    }
    stage.style.setProperty("--rx", rx.toFixed(2) + "deg");
    stage.style.setProperty("--ry", ry.toFixed(2) + "deg");

    // In the hero the cube sits lower; it rises to centre as the hero fades.
    const rise = smooth(clamp(t / 0.6));
    const sy = lerp(window.innerHeight * 0.17, 0, rise);
    stage.style.setProperty("--sy", sy.toFixed(1) + "px");
    stage.style.setProperty("--ss", lerp(0.92, 1, rise).toFixed(3));

    // Captions cross-fade by distance from their step.
    const nearest = Math.round(t);
    captions.forEach((el, i) => {
      const d = t - i;
      const o = reducedMotion.matches
        ? (i === nearest ? 1 : 0)
        : clamp(1 - (Math.abs(d) - 0.15) / 0.25);
      el.style.setProperty("--o", o.toFixed(3));
      el.style.setProperty("--shift", reducedMotion.matches ? 0 : (d * -40).toFixed(1));
      el.style.visibility = o > 0.01 ? "visible" : "hidden";
      el.setAttribute("aria-hidden", o > 0.5 ? "false" : "true");
    });

    pill.classList.toggle("is-hidden", window.scrollY > 40);
  }

  const request = () => {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  };
  window.addEventListener("scroll", request, { passive: true });
  window.addEventListener("resize", request);
  reducedMotion.addEventListener?.("change", request);
  update();

  /* Mouse parallax — fine pointers only, eased toward the target */
  let tx = 0, ty = 0, cx = 0, cy = 0, raf = 0;
  const loop = () => {
    cx = lerp(cx, tx, 0.08);
    cy = lerp(cy, ty, 0.08);
    stage.style.setProperty("--px", cx.toFixed(4));
    stage.style.setProperty("--py", cy.toFixed(4));
    raf = Math.abs(cx - tx) + Math.abs(cy - ty) > 0.001 ? requestAnimationFrame(loop) : 0;
  };
  window.addEventListener("pointermove", (e) => {
    if (!finePointer.matches || reducedMotion.matches || e.pointerType !== "mouse") return;
    tx = (e.clientX / window.innerWidth) * 2 - 1;
    ty = (e.clientY / window.innerHeight) * 2 - 1;
    if (!raf) raf = requestAnimationFrame(loop);
  }, { passive: true });
})();

/* ---------- Statement: words light up as you scroll ---------- */
(() => {
  const section = document.querySelector(".statement");
  const strike = section.querySelector("s");

  // Wrap each word in a span (the <s> word is wrapped from inside).
  section.querySelectorAll("[data-words]").forEach((line) => {
    [...line.childNodes].forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const frag = document.createDocumentFragment();
        node.textContent.split(/(\s+)/).forEach((part) => {
          if (!part) return;
          if (/^\s+$/.test(part)) frag.append(part);
          else {
            const w = document.createElement("span");
            w.className = "w";
            w.textContent = part;
            frag.append(w);
          }
        });
        node.replaceWith(frag);
      } else {
        node.innerHTML = `<span class="w">${node.textContent}</span>`;
      }
    });
  });
  const words = [...section.querySelectorAll(".w")];
  const firstLineCount = section.querySelector("[data-words]").querySelectorAll(".w").length;

  function update() {
    const rect = section.getBoundingClientRect();
    const travel = section.offsetHeight - window.innerHeight;
    // start lighting a little before the text is pinned
    const p = reducedMotion.matches ? 1 : clamp((-rect.top + window.innerHeight * 0.2) / (travel * 0.9));
    const lit = Math.round(p * words.length);
    words.forEach((w, i) => w.classList.toggle("is-on", i < lit));
    strike.classList.toggle("is-struck", lit >= firstLineCount);
  }
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (!ticking) { ticking = true; requestAnimationFrame(() => { ticking = false; update(); }); }
  }, { passive: true });
  update();
})();

/* ---------- Scroll reveal ---------- */
(() => {
  const els = document.querySelectorAll(".reveal");
  document.querySelectorAll(".steps .reveal").forEach((el, i) => {
    el.style.setProperty("--delay", `${i * 0.1}s`);
  });
  if (!("IntersectionObserver" in window)) {
    els.forEach((el) => el.classList.add("is-in"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-in");
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: "0px 0px -8% 0px" });
  els.forEach((el) => io.observe(el));
})();

/* ---------- Contact: sentence builder → WhatsApp ---------- */
(() => {
  const form = document.getElementById("contactForm");
  const hint = document.getElementById("formHint");
  const hintText = hint.textContent;
  const waBase = WHATSAPP_NUMBER ? `https://wa.me/${WHATSAPP_NUMBER}` : "https://wa.me/";

  // Contact links
  const fab = document.getElementById("fab");
  const phonePill = document.getElementById("phonePill");
  if (WHATSAPP_NUMBER) {
    fab.href = waBase;
    phonePill.href = waBase;
    // 966558000321 → +966 55 800 0321
    phonePill.textContent = "+" + WHATSAPP_NUMBER.replace(/^(\d{3})(\d{2})(\d{3})(\d{4})$/, "$1 $2 $3 $4");
  } else {
    fab.removeAttribute("target");
    phonePill.remove();
  }
  document.getElementById("year").textContent = new Date().getFullYear();

  // Tap a highlighted word to cycle its options
  form.querySelectorAll(".token").forEach((token) => {
    const options = token.dataset.options.split("|");
    token.addEventListener("click", () => {
      const next = (options.indexOf(token.textContent.trim()) + 1) % options.length;
      token.textContent = options[next];
      token.classList.remove("is-changed");
      void token.offsetWidth;
      token.classList.add("is-changed");
    });
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const idea = form.idea.value.trim();
    if (!idea) {
      hint.textContent = form.dataset.error;
      hint.classList.add("is-error");
      form.idea.focus();
      return;
    }
    hint.textContent = hintText;
    hint.classList.remove("is-error");

    const type = form.querySelector('[data-token="type"]').textContent.trim();
    const timing = form.querySelector('[data-token="timing"]').textContent.trim();
    // Message parts come from the page language (content/<lang>.json via data-* attributes)
    const fill = (text) => text.replace("{type}", type).replace("{timing}", timing).replace("{idea}", idea);
    const message = [
      form.dataset.greeting,
      fill(form.dataset.sentence),
      fill(form.dataset.idea),
    ].join("\n");

    const url = `${waBase}?text=${encodeURIComponent(message)}`;
    // "noopener" in the features string makes open() return null, so detach manually.
    const win = window.open(url, "_blank");
    if (win) win.opener = null;
    else window.location.href = url;
  });
})();
