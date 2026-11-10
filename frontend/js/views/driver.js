import { api } from "../api.js";
import { $, $$, DAYS, dayList, fmtDate, fmtTime, html, schematicMap, simBadge, toast } from "../ui.js";

export const driverNav = [
  { href: "/driver", label: "Dashboard", icon: "home", primary: true },
  { href: "/driver/availability", label: "Availability", icon: "clock" },
  { href: "/driver/requests", label: "Ride Requests", short: "Requests", icon: "bell", primary: true },
  { href: "/driver/trips", label: "Assigned Trips", short: "Trips", icon: "list", primary: true },
  { href: "/driver/route", label: "Route and Navigation", short: "Route", icon: "map", primary: true },
  { href: "/driver/earnings", label: "Earnings", icon: "rupee" },
  { href: "/driver/documents", label: "Documents", icon: "doc" },
  { href: "/driver/profile", label: "Profile", icon: "user" },
];
const head = (t, i) => html`<header><h1>${t}</h1>${i ? html`<p>${i}</p>` : ""}</header>`;
const VSTATUS = { pending: ["In review", "orange"], approved: ["Approved", "green"], rejected: ["Needs changes", "red"], suspended: ["Suspended", "red"] };
const vbadge = (s) => html`<span class="badge ${VSTATUS[s][1]}">${VSTATUS[s][0]}</span>`;

const gate = (d) => d.verification_status === "approved" ? "" : html`<div class="notice ${d.verification_status === "pending" ? "" : "red"}" style="margin-bottom:18px"><div><strong>${d.verification_status === "pending" ? "Your documents are in review." : d.verification_status === "rejected" ? "Your application needs changes." : "Your account is suspended."}</strong>
  <div>${d.verification_note || "You'll receive ride requests once an admin approves your licence, vehicle papers and insurance."}</div>${d.verification_status !== "suspended" ? html`<a class="link" href="/driver/documents" data-link>Upload or check documents</a>` : ""}</div></div>`;

const assignCard = (a, actions) => html`<div class="card stack" data-a="${a.id}"><div class="row spread wrap"><div><h3>${a.date ? fmtDate(a.date, { weekday: "long", day: "numeric", month: "long" }) : "Date to be set"}</h3><div class="muted">${a.direction === "morning" ? "Morning to the office" : "Evening home"}, ${a.passenger_count} passenger${a.passenger_count === 1 ? "" : "s"}${a.expected_duration_min ? `, about ${a.expected_duration_min} min${a.route_is_simulated ? " (simulated)" : ""}` : ""}</div></div><div class="row">${a.is_demo ? simBadge() : ""}<span class="badge ${a.status === "accepted" ? "green" : "orange"}">${a.status === "accepted" ? "Accepted" : "Waiting for you"}</span></div></div>
  <ol class="route">${a.passengers.map((p) => html`<li><span class="dot ${p.order === 1 ? "start" : ""}"></span><div><div class="t">${p.name}</div></div><div class="t">${fmtTime(p.pickup_time)}</div></li>`)}</ol>${actions ? html`<div class="row wrap"><button class="btn" data-r="accept">Accept</button><button class="btn danger" data-r="reject">Decline</button></div>` : ""}</div>`;

const respondMount = (host, rerender) => $$("[data-r]", host).forEach((b) => b.addEventListener("click", async () => {
  try { await api(`/driver/assignments/${b.closest("[data-a]").dataset.a}/${b.dataset.r}`, { method: "POST" }); toast(b.dataset.r === "accept" ? "Accepted." : "Declined."); rerender(); } catch (e) { toast(e.message, true); }
}));

async function dashboard(me) {
  const d = await api("/driver/dashboard");
  const all = [...d.today, ...d.upcoming];
  const stats = html`<div class="stats"><div class="stat"><div class="v">${d.seats_available ?? "–"}</div><div class="l">Passenger seats (legal capacity)</div></div>
    <div class="stat"><div class="v">${d.today.length}</div><div class="l">Trips today</div></div>
    <div class="stat"><div class="v">${d.today.reduce((n, a) => n + a.passenger_count, 0)}</div><div class="l">Passengers today</div></div>
    <div class="stat"><div class="v">${d.today[0]?.expected_duration_min ? d.today[0].expected_duration_min + " min" : "–"}</div><div class="l">Expected duration, first trip</div></div></div>`;
  return { title: "Dashboard", html: html`${head(`Hello, ${me.full_name.split(" ")[0]}`, "Your assignments and availability at a glance.")}${gate(d)}
    <div class="stack">${stats}
    ${d.offers.length ? html`<div class="notice green"><span>You have ${d.offers.length} ride request${d.offers.length > 1 ? "s" : ""} waiting.</span><a class="link" href="/driver/requests" data-link>Review</a></div>` : ""}
    <div class="card"><div class="row spread" style="margin-bottom:12px"><h3>Today's trips</h3>${vbadge(d.verification_status)}</div>${d.today.length ? html`<div class="stack">${d.today.map((a) => assignCard(a))}</div>` : html`<p class="muted">No trips today.</p>`}</div>
    <div class="card"><h3 style="margin-bottom:12px">Upcoming assignments</h3>${d.upcoming.length ? html`<div class="stack">${d.upcoming.map((a) => assignCard(a))}</div>` : html`<p class="muted">${d.can_receive_assignments ? "Nothing assigned yet. We'll tell you when a recurring commute is proposed." : "Assignments start after approval."}</p>`}</div>
    <details class="small muted"><summary style="cursor:pointer">Where these numbers come from</summary><p style="margin-top:8px">Seats: ${d.data_sources.seats}. Trips: ${d.data_sources.assignments}.</p></details></div>` };
}

async function availability() {
  const p = await api("/driver/profile");
  const row = (k, v) => html`<div class="row spread" style="padding:10px 0;border-bottom:1px solid var(--line)"><span class="muted">${k}</span><strong style="text-align:right">${v || "–"}</strong></div>`;
  return { title: "Availability", html: html`${head("Availability", "When and where you can take commute rides.")}<div class="card">${row("Days", dayList(p.available_days))}${row("Morning window", p.morning_start ? `${fmtTime(p.morning_start)} to ${fmtTime(p.morning_end)}` : "")}${row("Evening window", p.evening_start ? `${fmtTime(p.evening_start)} to ${fmtTime(p.evening_end)}` : "")}${row("Service areas", p.service_areas.join(", "))}<p style="margin-top:16px"><a class="btn" href="/onboarding?edit=1" data-link>Change availability</a></p></div>` };
}

async function requests() {
  const list = await api("/driver/requests");
  return { title: "Ride Requests", html: html`${head("Ride Requests", "Recurring commutes proposed to you. Each is reviewed by an admin first.")}${list.length ? html`<div class="stack">${list.map((a) => assignCard(a, true))}</div>` : html`<div class="card empty"><h3>No requests right now</h3><p>When a verified group fits your vehicle and hours, it appears here.</p></div>`}`, mount: respondMount };
}

async function trips() {
  const d = await api("/driver/dashboard");
  const all = [...d.today, ...d.upcoming];
  return { title: "Assigned Trips", html: html`${head("Assigned Trips", "Trips you've accepted.")}${gate(d)}${all.length ? html`<div class="stack">${all.map((a) => assignCard(a))}</div>` : html`<div class="card empty"><h3>No assigned trips yet</h3><p>Accepted rides show up here with the pickup order.</p></div>`}` };
}

async function route() {
  const r = await api("/driver/route/next");
  if (!r) return { title: "Route and Navigation", html: html`${head("Route and Navigation", "Your next pickup order and destination.")}<div class="card empty"><h3>No route to show</h3><p>Once you have a ride request or an accepted trip, its pickup order and map appear here.</p></div>` };
  return { title: "Route and Navigation", html: html`${head("Route and Navigation", "Pickups in order, ending at the office.")}
    ${r.is_simulated ? html`<div class="notice" style="margin-bottom:16px"><span>${simBadge()} This route is a simulated sequence. Turn-by-turn navigation needs a maps key and arrives in a later phase.</span></div>` : ""}
    <div class="cols"><div class="card"><ol class="route">${r.stops.map((s) => html`<li><span class="dot ${s.type === "dropoff" ? "office" : s.sequence === 0 ? "start" : ""}"></span><div><div class="t">${s.type === "dropoff" ? "Drop-off" : `Pickup ${s.sequence + 1}`}: ${s.label}</div></div><div class="t">${fmtTime(s.eta)}</div></li>`)}</ol></div>${schematicMap(r.stops, { height: 300, caption: r.is_simulated ? "Simulated, not a road route" : "Route" })}</div>` };
}

async function earnings() {
  return { title: "Earnings", html: html`${head("Earnings", "Estimated earnings from completed trips.")}<div class="card empty"><h3>No completed trips yet</h3><p>We only show earnings from trips you've actually completed. We don't project figures before then.</p></div>` };
}

const DOCS = [["licence", "Driving licence"], ["rc", "Vehicle registration certificate"], ["insurance", "Insurance policy"], ["permit", "Commercial permit"], ["id_proof", "ID proof"]];
async function documents() {
  const [docs, d] = await Promise.all([api("/driver/documents"), api("/driver/dashboard")]);
  const have = new Set(docs.map((x) => x.doc_type));
  return { title: "Documents", html: html`${head("Documents", "Upload clear photos or PDFs. Files are stored privately and only reviewers can open them.")}${gate(d)}
    <div class="cols"><div class="card stack"><h3>Checklist</h3><ul style="list-style:none;margin:0;padding:0">${DOCS.map(([k, l]) => { const doc = docs.find((x) => x.doc_type === k); return html`<li class="row spread" style="padding:10px 0;border-bottom:1px solid var(--line)"><span>${l}${doc ? html`<div class="small muted">${doc.filename || "uploaded"}</div>` : ""}</span>${doc ? vbadge(doc.status) : html`<span class="badge">Not uploaded</span>`}</li>`; })}</ul></div>
    <form id="fd" class="card stack"><h3>Upload a document</h3><label class="field"><span class="lbl">Document</span><select name="t">${DOCS.map(([k, l]) => html`<option value="${k}">${l}</option>`)}</select></label>
      <label class="field"><span class="lbl">File (PDF, JPG or PNG, up to 5 MB)</span><input type="file" name="f" accept=".pdf,.jpg,.jpeg,.png" required></label><button class="btn">Upload</button></form></div>`,
    mount: (host, rerender) => $("#fd", host).addEventListener("submit", async (e) => {
      e.preventDefault(); const f = e.target, file = f.f.files[0]; if (!file) return;
      const form = new FormData(); form.append("doc_type", f.t.value); form.append("file", file);
      try { await api("/driver/documents", { method: "POST", form }); toast("Uploaded. It'll be reviewed shortly."); rerender(); } catch (er) { toast(er.message, true); }
    }) };
}

async function profile() {
  const p = await api("/driver/profile"), v = p.vehicle;
  const row = (k, val) => html`<div class="row spread" style="padding:10px 0;border-bottom:1px solid var(--line)"><span class="muted">${k}</span><strong style="text-align:right">${val || "–"}</strong></div>`;
  return { title: "Profile", html: html`${head("Profile")}<div class="cols"><div class="card"><div class="row spread"><h3>Your details</h3>${vbadge(p.verification_status)}</div>${row("Name", p.full_name)}${row("Mobile", p.phone)}${row("Email", p.email)}${row("City", p.city)}${row("Licence number", p.licence_number)}<p style="margin-top:16px"><a class="btn" href="/onboarding?edit=1" data-link>Edit details</a></p></div>
    <div class="card"><h3>Vehicle</h3>${v ? html`${row("Registration", v.registration_number)}${row("Type", v.category)}${row("Model", v.model)}${row("Legal passenger capacity", v.permitted_passenger_capacity)}${row("Insurance", v.insurance_provider)}${row("Eligibility", VSTATUS[v.eligibility_status][0])}` : html`<p class="muted">No vehicle added.</p>`}<p class="small muted" style="margin-top:12px">Changing the vehicle or its capacity sends your account back for review.</p></div></div>` };
}

export const driverRoutes = { "/driver": dashboard, "/driver/availability": availability, "/driver/requests": requests, "/driver/trips": trips, "/driver/route": route, "/driver/earnings": earnings, "/driver/documents": documents, "/driver/profile": profile };
