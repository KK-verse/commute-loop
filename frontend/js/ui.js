// Tiny view toolkit: auto-escaping html`` templates, icons, toasts, schematic map.
export class Raw { constructor(s) { this.s = s; } }
export const raw = (s) => new Raw(s);
const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
const str = (v) => (v == null || v === false ? "" : v instanceof Raw ? v.s : Array.isArray(v) ? v.map(str).join("") : esc(v));
export function html(strings, ...vals) {
  let out = strings[0];
  vals.forEach((v, i) => { out += str(v) + strings[i + 1]; });
  return new Raw(out);
}
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const ICONS = {
  home: '<path d="M3 11l9-8 9 8M5 10v10h14V10"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M6 16.5V9a3 3 0 0 1 3-3h6.5"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  wallet: '<path d="M4 7a2 2 0 0 1 2-2h12v4"/><rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="16.5" cy="13.5" r="1.2"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  car: '<path d="M5 16v-5l2-5h10l2 5v5"/><path d="M3 16h18v3H3zM7 11h10"/>',
  doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z"/><path d="M9 4v14M15 6v14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  logout: '<path d="M9 4H5v16h4M16 8l4 4-4 4M20 12H9"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.3-5 6.5-5s5.7 1.5 6.5 5"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14.5c2.5 0 4 1.3 4.5 4"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  chart: '<path d="M4 20V4M4 20h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  swap: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
  phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  pin: '<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  more: '<path d="M5 12h.01M12 12h.01M19 12h.01" stroke-width="3"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  building: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M10 21v-4h4v4"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
  seat: '<path d="M7 4v9a3 3 0 0 0 3 3h7M7 13H5v6h2M17 16v4"/>',
  rupee: '<path d="M7 5h10M7 9h10M7 5c5 0 7 1.5 7 4s-2 4-7 4l7 7"/>',
};
export const icon = (name, cls = "") =>
  raw(`<svg class="i ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ""}</svg>`);

export const logoMark = raw(`<svg viewBox="0 0 34 34" aria-hidden="true"><rect width="34" height="34" rx="10" fill="#16243f"/><path d="M9 23a8 8 0 1 1 16 0" fill="none" stroke="#2e9e63" stroke-width="3.4" stroke-linecap="round"/><circle cx="9" cy="23" r="3" fill="#e8762b"/><circle cx="25" cy="23" r="3" fill="#fff"/></svg>`);
export const logo = (href = "/") => html`<a class="logo" href="${href}" data-link aria-label="CommuteLoop home">${logoMark}<span>Commute<b>Loop</b></span></a>`;

export function toast(msg, isErr = false) {
  const el = document.createElement("div");
  el.className = "toast" + (isErr ? " err" : "");
  el.setAttribute("role", isErr ? "alert" : "status");
  el.textContent = msg;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), isErr ? 6000 : 3800);
}

export const fmtTime = (hhmm) => {
  if (!hhmm) return "–";
  const [h, m] = hhmm.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${ap}`;
};
export const fmtDate = (iso, opts = { weekday: "short", day: "numeric", month: "short" }) =>
  new Date(iso + "T00:00:00").toLocaleDateString("en-IN", opts);
export const inr = (n) => (n == null ? "–" : "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const dayList = (days) => {
  const s = [...days].sort().join();
  if (s === "0,1,2,3,4") return "Monday to Friday";
  if (s === "0,1,2,3,4,5") return "Monday to Saturday";
  return days.map((d) => DAYS[d]).join(", ");
};

export const STATUS = {
  MATCHING: ["Finding a match", ""], PROPOSED: ["Match proposed", "orange"], CONFIRMED: ["Confirmed", "green"],
  IN_PROGRESS: ["On the way", "green"], COMPLETED: ["Completed", "green"], CANCELLED: ["Cancelled", "red"],
  NO_MATCH: ["No match yet", "orange"], REASSIGNMENT_PENDING: ["Finding a replacement", "orange"],
  SKIPPED: ["Skipped", ""],
};
export const statusBadge = (s, underReview = false) => {
  if (underReview) return html`<span class="badge orange">Match under review</span>`;
  const [label, tone] = STATUS[s] || [s, ""];
  return html`<span class="badge ${tone}">${label}</span>`;
};
export const simBadge = (text = "Simulated") => html`<span class="badge sim">${text}</span>`;

/* Schematic map: plots stops by relative position. It is NOT a road map and says so on the tile. */
export function schematicMap(stops, { height = 300, caption = "Schematic, not a road route" } = {}) {
  const pts = stops.filter((s) => s.lat != null && s.lng != null);
  if (!pts.length) return html`<div class="map"><div class="empty">No coordinates yet.</div></div>`;
  const W = 640, H = height, pad = 54;
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  const minLa = Math.min(...lats), maxLa = Math.max(...lats), minLn = Math.min(...lngs), maxLn = Math.max(...lngs);
  const spanLa = Math.max(maxLa - minLa, 0.004), spanLn = Math.max(maxLn - minLn, 0.004);
  const sc = Math.min((W - pad * 2) / spanLn, (H - pad * 2) / spanLa);
  const cx = (minLn + maxLn) / 2, cy = (minLa + maxLa) / 2;
  const xy = (p) => [W / 2 + (p.lng - cx) * sc, H / 2 - (p.lat - cy) * sc];
  const P = pts.map(xy);
  const path = P.map((q, i) => `${i ? "L" : "M"}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(" ");
  const dots = pts.map((p, i) => {
    const [x, y] = P[i];
    const last = i === pts.length - 1 && pts.length > 1;
    const left = x > W - 150;
    return `<g><circle cx="${x}" cy="${y}" r="${last ? 9 : 8}" fill="${last ? "#16243f" : "#fff"}" stroke="${last ? "#16243f" : "#2e9e63"}" stroke-width="4"/>
      <text x="${left ? x - 14 : x + 14}" y="${y + 4}" text-anchor="${left ? "end" : "start"}" font-size="13" font-weight="700" fill="#16243f" font-family="Figtree,sans-serif" paint-order="stroke" stroke="#eef3f0" stroke-width="4">${esc(p.label || "")}</text></g>`;
  }).join("");
  return raw(`<div class="map"><span class="tag badge sim">${esc(caption)}</span>
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Schematic of stops">
      <defs><pattern id="g" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#dfe8e2" stroke-width="1"/></pattern></defs>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
      <path d="${path}" fill="none" stroke="#2e9e63" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 0"/>
      ${dots}</svg></div>`);
}

export function confirmDialog({ title, body, confirmText = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    const back = document.createElement("div");
    back.className = "sheet-back";
    back.style.alignItems = "center"; back.style.justifyContent = "center";
    back.innerHTML = `<div class="card" role="dialog" aria-modal="true" aria-labelledby="dlg-t" style="max-width:420px;width:calc(100% - 32px)">
      <h3 id="dlg-t">${esc(title)}</h3><p class="muted" style="margin:8px 0 20px">${esc(body)}</p>
      <div class="row" style="justify-content:flex-end"><button class="btn ghost sm" data-r="0">Keep it</button>
      <button class="btn sm ${danger ? "danger" : ""}" data-r="1">${esc(confirmText)}</button></div></div>`;
    const done = (v) => { back.remove(); resolve(v); };
    back.addEventListener("click", (e) => { const r = e.target.closest("[data-r]"); if (r) done(r.dataset.r === "1"); else if (e.target === back) done(false); });
    document.body.append(back);
    back.querySelector("[data-r='0']").focus();
  });
}
