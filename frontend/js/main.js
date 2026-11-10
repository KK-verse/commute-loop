import { api, session, setUnauthorizedHandler } from "./api.js";
import { $, html, icon, logo, toast } from "./ui.js";
import { landing, mountLanding } from "./views/landing.js";
import { authView } from "./views/auth.js";
import { onboarding } from "./views/onboarding.js";
import { commuterRoutes, commuterNav } from "./views/commuter.js";
import { driverRoutes, driverNav } from "./views/driver.js";
import { adminRoutes, adminNav } from "./views/admin.js";

const app = $("#app");
const HOME = { commuter: "/app", driver: "/driver", admin: "/admin" };
const NAVS = { commuter: commuterNav, driver: driverNav, admin: adminNav };
const ROLE_TABLES = { commuter: commuterRoutes, driver: driverRoutes, admin: adminRoutes };
export const config = { demo_mode: false, otp_test_mode: false, routing_is_simulated: true, maps: {} };

export function go(path, replace = false) {
  history[replace ? "replaceState" : "pushState"]({}, "", path);
  render();
}
setUnauthorizedHandler(() => { toast("Your session ended. Sign in again."); go("/login", true); });

document.addEventListener("click", (e) => {
  const a = e.target.closest("a[data-link]");
  if (!a || e.metaKey || e.ctrlKey || e.shiftKey || a.target === "_blank") return;
  e.preventDefault();
  closeSheet();
  go(a.getAttribute("href"));
});
window.addEventListener("popstate", render);

function closeSheet() { document.querySelector(".sheet-back[data-nav]")?.remove(); }

function shell(role, active, user, content) {
  const nav = NAVS[role];
  const link = (n) => html`<a href="${n.href}" data-link ${n.href === active ? html`aria-current="page"` : ""}>${icon(n.icon)}<span>${n.label}</span></a>`;
  const primary = nav.filter((n) => n.primary);
  const hasMore = nav.length > primary.length;
  const moreActive = !primary.some((n) => n.href === active);
  return html`<div class="shell">
    <aside class="side" aria-label="Main">
      ${logo(HOME[role])}
      <nav class="nav">${nav.map(link)}</nav>
      <div class="me">
        <div class="small muted" style="padding:0 12px 10px"><strong style="color:var(--navy)">${user.full_name}</strong><br>${user.role === "admin" ? "Administrator" : user.role === "driver" ? "Driver" : "Commuter"}</div>
        <button class="btn ghost sm block" id="logout">${icon("logout")} Sign out</button>
      </div>
    </aside>
    <div class="main">
      <div class="topbar">${logo(HOME[role])}<button class="btn ghost sm" id="logout2" aria-label="Sign out">${icon("logout")}</button></div>
      <main id="main" class="page" tabindex="-1">${content}</main>
    </div>
    <nav class="bottom" aria-label="Main">
      ${primary.map((n) => html`<a href="${n.href}" data-link ${n.href === active ? html`aria-current="page"` : ""}>${icon(n.icon)}<span>${n.short || n.label}</span></a>`)}
      ${hasMore ? html`<button id="more" ${moreActive ? html`aria-current="page"` : ""}>${icon("more")}<span>More</span></button>` : ""}
    </nav>
  </div>`;
}

function openMore(role, active) {
  closeSheet();
  const back = document.createElement("div");
  back.className = "sheet-back"; back.dataset.nav = "1";
  back.innerHTML = `<div class="sheet" role="dialog" aria-label="All pages"><nav class="nav">${NAVS[role].map((n) =>
    html`<a href="${n.href}" data-link ${n.href === active ? html`aria-current="page"` : ""}>${icon(n.icon)}<span>${n.label}</span></a>`.s).join("")}</nav></div>`;
  back.addEventListener("click", (e) => { if (e.target === back) closeSheet(); });
  document.body.append(back);
}

async function logout() {
  try { await api("/auth/logout", { method: "POST" }); } catch {}
  session.clear();
  toast("You're signed out.");
  go("/", true);
}

function match(table, path) {
  if (table[path]) return table[path];
  return null;
}

let renderToken = 0;
let disposeLanding = null;
async function render() {
  disposeLanding?.();
  disposeLanding = null;
  const my = ++renderToken;
  const path = location.pathname.replace(/\/+$/, "") || "/";
  const user = session.user;
  window.scrollTo(0, 0);

  if (path === "/") {
    app.innerHTML = landing(user, config).s;
    disposeLanding = mountLanding(app);
    document.title = "CommuteLoop · Your route. Your routine. One shared ride.";
    return;
  }
  if (path === "/login" || path === "/register") {
    if (user && session.token) { go(HOME[user.role], true); return; }
    authView(app, path === "/register" ? "register" : "login", config, (u) => {
      toast(`Welcome, ${u.full_name.split(" ")[0]}.`);
      go(u.onboarding_complete || u.role === "admin" ? HOME[u.role] : "/onboarding", true);
    });
    return;
  }
  if (!user || !session.token) { go("/login", true); return; }

  // Fresh server view of the account (role and onboarding can change server-side).
  let me;
  try { me = await api("/auth/me"); session.setUser(me); } catch { return; }
  if (my !== renderToken) return;

  if (path === "/onboarding") {
    if (me.role === "admin") { go(HOME.admin, true); return; }
    onboarding(app, me, config, (u) => { toast("Saved."); go(HOME[u.role], true); });
    return;
  }
  const area = path.split("/")[1];
  if (!["app", "driver", "admin"].includes(area)) { app.innerHTML = notFound().s; return; }
  if (HOME[me.role].slice(1) !== area) {
    toast("That area is for a different account type. Taking you to yours.", true);
    go(HOME[me.role], true); return;
  }
  if (me.role !== "admin" && !me.onboarding_complete) { go("/onboarding", true); return; }

  const route = match(ROLE_TABLES[me.role], path);
  if (!route) { app.innerHTML = shell(me.role, path, me, html`<div class="empty"><h3>We can't find that page</h3><a class="btn" href="${HOME[me.role]}" data-link>Back to home</a></div>`).s; wire(me.role, path); return; }
  app.innerHTML = shell(me.role, path, me, html`<div class="empty muted">Loading…</div>`).s;
  wire(me.role, path);
  try {
    const out = await route(me, config);
    if (my !== renderToken) return;
    const host = $("#main");
    host.innerHTML = out.html.s;
    if (out.mount) out.mount(host, () => render());
    document.title = `${out.title || "CommuteLoop"} · CommuteLoop`;
  } catch (e) {
    if (my !== renderToken) return;
    $("#main").innerHTML = html`<div class="notice red">${e.message}</div><p style="margin-top:16px"><button class="btn ghost sm" id="retry">Try again</button></p>`.s;
    $("#retry")?.addEventListener("click", render);
  }
}

function wire(role, path) {
  $("#logout")?.addEventListener("click", logout);
  $("#logout2")?.addEventListener("click", logout);
  $("#more")?.addEventListener("click", () => openMore(role, path));
}

const notFound = () => html`<div class="wrap" style="padding:80px 24px;text-align:center">${logo()}<h1 style="margin-top:36px">We can't find that page</h1><p class="muted" style="margin:12px 0 24px">The link may be old or mistyped.</p><a class="btn" href="/" data-link>Go to the home page</a></div>`;

(async () => {
  try { Object.assign(config, await api("/config")); } catch {}
  if ("serviceWorker" in navigator) { /* PWA install support arrives with the mobile phase */ }
  render();
})();
