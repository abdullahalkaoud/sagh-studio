// Cloudflare Worker: serves the built site (dist/, via the ASSETS binding) and
// handles GitHub login for the Decap CMS panel at /admin.
//
//   /api/auth      → redirects to GitHub's OAuth screen
//   /api/callback  → swaps GitHub's code for a token and hands it to the CMS window
//
// Needs two secrets on the Worker: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET
// (from the "Sagh CMS" OAuth app on GitHub, whose redirect URI is <site>/api/callback).

const STATE_COOKIE = "sagh_oauth_state";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/auth") return startLogin(url, env);
    if (url.pathname === "/api/callback") return finishLogin(request, url, env);
    return env.ASSETS.fetch(request);
  },
};

function startLogin(url, env) {
  if (!env.GITHUB_CLIENT_ID) return new Response("GITHUB_CLIENT_ID is not set on the Worker", { status: 500 });
  const state = crypto.randomUUID();
  const authorize = new URL("https://github.com/login/oauth/authorize");
  authorize.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authorize.searchParams.set("redirect_uri", `${url.origin}/api/callback`);
  authorize.searchParams.set("scope", url.searchParams.get("scope") || "repo");
  authorize.searchParams.set("state", state);
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      "Set-Cookie": `${STATE_COOKIE}=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
    },
  });
}

async function finishLogin(request, url, env) {
  const cookie = request.headers.get("Cookie") || "";
  const expected = cookie.match(new RegExp(`${STATE_COOKIE}=([^;]+)`))?.[1];
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");

  if (!code || !state || state !== expected) {
    return handoff("error", { message: "Login expired or was tampered with. Close this window and try again." });
  }

  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "sagh-cms" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: `${url.origin}/api/callback`,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) {
    return handoff("error", { message: data.error_description || "GitHub did not return a token." });
  }
  return handoff("success", { token: data.access_token, provider: "github" });
}

// Decap's login popup protocol: announce "authorizing:github", wait for the CMS window
// to answer, then post "authorization:github:<status>:<json>" back to that origin only.
function handoff(status, payload) {
  const message = `authorization:github:${status}:${JSON.stringify(payload)}`;
  const html = `<!doctype html><meta charset="utf-8"><title>Sagh CMS</title>
<p style="font-family:system-ui;padding:24px">${status === "success" ? "Logged in. You can close this window." : "Login failed. Close this window and try again."}</p>
<script>
  (function () {
    var message = ${JSON.stringify(message)};
    function reply(e) {
      if (e.origin !== window.location.origin) return;
      window.opener.postMessage(message, e.origin);
      window.removeEventListener("message", reply);
    }
    window.addEventListener("message", reply);
    if (window.opener) window.opener.postMessage("authorizing:github", window.location.origin);
  })();
</script>`;
  return new Response(html, {
    status: status === "success" ? 200 : 400,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Set-Cookie": `${STATE_COOKIE}=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    },
  });
}
