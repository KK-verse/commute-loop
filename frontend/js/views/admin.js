import { api } from "../api.js";
import { $, $$, confirmDialog, dayList, fmtDate, fmtTime, html, inr, schematicMap, simBadge, statusBadge, toast } from "../ui.js";
import { technologyDemo } from "./technology-demo.js";

export const adminNav = [
  { href: "/admin", label: "Overview", icon: "chart", primary: true },
  { href: "/admin/commuters", label: "Commuters", icon: "users" },
  { href: "/admin/drivers", label: "Drivers", icon: "car", primary: true },
  { href: "/admin/vehicles", label: "Vehicle Verification", short: "Verify", icon: "shield", primary: true },
  { href: "/admin/requests", label: "Commute Requests", icon: "route" },
  { href: "/admin/matches", label: "Match Management", short: "Matches", icon: "swap", primary: true },
  { href: "/admin/trips", label: "Trips", icon: "list" },
  { href: "/admin/reassignment", label: "Reassignment", icon: "alert" },
  { href: "/admin/reports", label: "Reports", icon: "doc" },
  { href: "/admin/technology-demo", label: "Technology Demo", icon: "map" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];
const head = (t, i) => html`<header><h1>${t}</h1>${i ? html`<p>${i}</p>` : ""}</header>`;
const SB = { pending: "orange", approved: "green", rejected: "red", suspended: "red" };
const sbadge = (s) => html`<span class="badge ${SB[s] || ""}">${s}</span>`;
const table = (cols, rows) => html`<div class="table-wrap"><table><thead><tr>${cols.map((c) => html`<th>${c}</th>`)}</tr></thead><tbody>${rows}</tbody></table></div>`;
const nothing = (t, p) => html`<div class="card empty"><h3>${t}</h3><p>${p}</p></div>`;

async function overview() {
  const o = await api("/admin/overview");
  const M = [["total_commuters", "Commuters"], ["registered_drivers", "Registered drivers"], ["pending_driver_verifications", "Pending driver verifications"], ["active_commute_requests", "Active commute requests"], ["proposed_matches", "Proposed matches"], ["confirmed_trips", "Confirmed trips"], ["cancelled_trips", "Cancelled or skipped trips"], ["unassigned_trips", "Unassigned trips"]];
  return { title: "Overview", html: html`${head("Overview", "Live counts from the database. Simulated demo records are counted separately.")}
    ${o.demo_mode ? html`<div class="notice" style="margin-bottom:16px"><span>${simBadge("Demo mode")} Demonstration users, routes and fares are labelled as simulated. Counts show how many of each are simulated.</span></div>` : ""}
    <div class="stats">${M.map(([k, l]) => { const m = o.metrics[k]; return html`<div class="stat"><div class="v">${m.total}</div><div class="l">${l}</div>${m.demo ? html`<div class="s">${m.demo} simulated, ${m.real} real</div>` : ""}</div>`; })}</div>
    ${o.open_incidents ? html`<div class="notice red" style="margin-top:16px">${o.open_incidents} safety report${o.open_incidents > 1 ? "s" : ""} open.</div>` : ""}
    <p class="small muted" style="margin-top:16px">Source tables: ${o.sources.metrics}.</p>` };
}

async function commuters() {
  const list = await api("/admin/commuters");
  return { title: "Commuters", html: html`${head("Commuters", `${list.length} registered.`)}${list.length ? table(["Name", "Mobile", "Company", "City", "Set up", "Joined"], list.map((u) => html`<tr><td><strong>${u.name}</strong> ${u.is_demo ? simBadge() : ""}</td><td>${u.phone}</td><td>${u.company || "–"}</td><td>${u.city || "–"}</td><td>${u.onboarded ? "Yes" : "Not yet"}</td><td>${fmtDate(u.joined.slice(0, 10), { day: "numeric", month: "short", year: "numeric" })}</td></tr>`)) : nothing("No commuters yet", "They appear here after they register.")}` };
}

async function drivers() {
  const list = await api("/admin/drivers");
  return { title: "Drivers", html: html`${head("Drivers", `${list.length} registered.`)}${list.length ? table(["Name", "Mobile", "City", "Vehicle", "Seats", "Status"], list.map((d) => html`<tr><td><strong>${d.name}</strong> ${d.is_demo ? simBadge() : ""}</td><td>${d.phone}</td><td>${d.city || "–"}</td><td>${d.vehicle ? `${d.vehicle.category}, ${d.vehicle.registration}` : "–"}</td><td>${d.vehicle?.capacity ?? "–"}</td><td>${sbadge(d.status)}</td></tr>`)) : nothing("No drivers yet", "They appear here after they register.")}` };
}

async function vehicles() {
  const list = await api("/admin/drivers");
  const pending = list.filter((d) => d.status === "pending" && d.onboarded), rest = list.filter((d) => !(d.status === "pending" && d.onboarded));
  const card = (d) => html`<article class="card stack" data-d="${d.id}"><div class="row spread wrap"><div><h3>${d.name} ${d.is_demo ? simBadge() : ""}</h3><div class="muted small">${d.phone}, ${d.city || ""}. Licence ${d.licence_number || "not given"}</div></div>${sbadge(d.status)}</div>
    ${d.vehicle ? html`<div class="grid2"><div><div class="muted small">Vehicle</div><strong>${d.vehicle.category}, ${d.vehicle.model || "model not given"}</strong><div>${d.vehicle.registration}</div></div><div><div class="muted small">Declared legal passenger capacity</div><strong style="font-size:1.4rem">${d.vehicle.capacity}</strong><div class="small muted">Check against the registration certificate or permit.</div></div>
      <div><div class="muted small">Insurance</div>${d.vehicle.insurance_provider || "not given"}${d.vehicle.insurance_expiry ? `, valid until ${d.vehicle.insurance_expiry}` : ""}</div><div><div class="muted small">Permit</div>${d.vehicle.permit_number || "not given"}</div></div>` : html`<p class="muted">No vehicle submitted.</p>`}
    <div><div class="muted small" style="margin-bottom:6px">Documents</div>${d.documents.length ? d.documents.map((x) => html`<span class="badge" style="margin:0 6px 6px 0">${x.type}: ${x.status}</span>`) : html`<span class="small muted">None uploaded yet</span>`}</div>
    ${d.note ? html`<p class="small muted">Last note: ${d.note}</p>` : ""}
    <div class="row wrap">${d.status !== "approved" ? html`<button class="btn sm" data-v="approved">Approve</button>` : ""}${d.status !== "rejected" ? html`<button class="btn danger sm" data-v="rejected">Reject</button>` : ""}${d.status === "approved" ? html`<button class="btn danger sm" data-v="suspended">Suspend</button>` : ""}</div></article>`;
  return { title: "Vehicle Verification", html: html`${head("Vehicle Verification", "Approve a driver only after checking licence, vehicle papers, insurance and the declared passenger capacity.")}
    <h2 style="font-size:1.2rem;margin-bottom:12px">Waiting for review (${pending.length})</h2><div class="stack">${pending.length ? pending.map(card) : html`<div class="card empty">Nothing waiting for review.</div>`}</div>
    <h2 style="font-size:1.2rem;margin:28px 0 12px">Other drivers (${rest.length})</h2><div class="stack">${rest.map(card)}</div>`,
    mount: (host, rerender) => $$("[data-v]", host).forEach((b) => b.addEventListener("click", async () => {
      const id = b.closest("[data-d]").dataset.d, decision = b.dataset.v;
      let note = null;
      if (decision !== "approved") { note = prompt(decision === "rejected" ? "What should the driver fix? (shown to them)" : "Reason for suspension (shown to the driver)"); if (!note || !note.trim()) return; }
      else if (!(await confirmDialog({ title: "Approve this driver?", body: "They will be able to receive ride assignments. Confirm you've checked their documents and capacity.", confirmText: "Approve" }))) return;
      try { await api(`/admin/drivers/${id}/verification`, { method: "POST", body: { decision, note } }); toast(`Driver ${decision}.`); rerender(); } catch (e) { toast(e.message, true); }
    })) };
}

async function requests() {
  const list = await api("/admin/commute-requests");
  return { title: "Commute Requests", html: html`${head("Commute Requests", `${list.length} on file.`)}${list.length ? table(["Commuter", "From", "To", "Arrive by", "Return", "Days", "Vehicle", "Extra time", "Status"], list.map((r) => html`<tr><td><strong>${r.commuter}</strong> ${r.is_demo ? simBadge() : ""}</td><td>${r.home}</td><td>${r.office}</td><td>${fmtTime(r.arrival_deadline)}</td><td>${r.evening ? fmtTime(r.evening) : "–"}</td><td>${dayList(r.days)}</td><td>${r.vehicle}</td><td>${r.max_extra_minutes} min</td><td>${r.status}</td></tr>`)) : nothing("No requests yet", "Requests appear when commuters finish setting up.")}` };
}

async function matches() {
  const list = await api("/admin/matches");
  const card = (g) => html`<article class="card stack" data-g="${g.id}"><div class="row spread wrap"><div><h3>${g.date ? fmtDate(g.date, { weekday: "long", day: "numeric", month: "long" }) : "Undated"}, ${g.direction}</h3><div class="muted small">Driver ${g.driver?.name || "unassigned"}${g.vehicle ? `, ${g.vehicle.category} ${g.vehicle.registration}` : ""}</div></div><div class="row">${g.is_demo ? simBadge() : ""}<span class="badge ${g.status === "confirmed" ? "green" : g.status === "rejected" ? "red" : "orange"}">${g.status}</span></div></div>
    <div class="cols"><div><div class="muted small" style="margin-bottom:6px">Pickup order</div><ol class="route">${g.stops.map((s) => html`<li><span class="dot ${s.type === "dropoff" ? "office" : s.sequence === 0 ? "start" : ""}"></span><div><div class="t">${s.type === "dropoff" ? "Drop-off" : `Pickup ${s.sequence + 1}`}: ${s.label}</div></div><div class="t">${fmtTime(s.eta)}</div></li>`)}</ol></div>${schematicMap(g.stops, { height: 220, caption: g.route_is_simulated ? "Simulated route" : "Route" })}</div>
    <div class="stats"><div class="stat"><div class="v">${g.capacity_used}/${g.capacity ?? "?"}</div><div class="l">Seats used (legal capacity)</div></div><div class="stat"><div class="v">${g.total_minutes ?? "–"}${g.total_minutes ? " min" : ""}</div><div class="l">Shared route time${g.direct_minutes ? `, ${g.direct_minutes} min direct` : ""}</div></div><div class="stat"><div class="v">${g.score != null ? Math.round(g.score) : "–"}</div><div class="l">Match score (0 to 100)</div>${g.score == null ? html`<div class="s">Engine arrives next phase</div>` : ""}</div></div>
    <div class="table-wrap"><table><thead><tr><th>Rider</th><th>Pickup</th><th>Arrival</th><th>Distance</th><th>Fare share</th><th>Response</th></tr></thead><tbody>${g.participants.map((p) => html`<tr><td>${p.name}</td><td>${fmtTime(p.pickup_time)}</td><td>${fmtTime(p.arrival_time)}</td><td>${p.distance_km != null ? p.distance_km + " km" : "–"}</td><td>${inr(p.fare_inr)} ${p.fare_is_simulated ? simBadge() : ""}</td><td>${p.response}</td></tr>`)}</tbody></table></div>
    <div class="notice"><span><strong>Why this group</strong><br>${g.explanation || "No explanation recorded."}</span></div>
    ${g.status === "proposed" ? html`<div class="row wrap"><button class="btn" data-m="approve">Approve and send to riders and driver</button><button class="btn danger" data-m="reject">Reject</button></div>` : ""}</article>`;
  return { title: "Match Management", html: html`${head("Match Management", "Review each proposed group before riders and drivers see it.")}${list.length ? html`<div class="stack">${list.map(card)}</div>` : nothing("No matches yet", "Proposed groups appear here for review.")}`,
    mount: (host, rerender) => $$("[data-m]", host).forEach((b) => b.addEventListener("click", async () => {
      const id = b.closest("[data-g]").dataset.g, decision = b.dataset.m;
      if (decision === "reject" && !(await confirmDialog({ title: "Reject this match?", body: "Riders go back to matching and the driver offer is withdrawn.", confirmText: "Reject", danger: true }))) return;
      try { await api(`/admin/matches/${id}/decision`, { method: "POST", body: { decision } }); toast(decision === "approve" ? "Approved. Riders and the driver have been notified." : "Rejected."); rerender(); } catch (e) { toast(e.message, true); }
    })) };
}

async function trips() {
  const list = await api("/admin/trips");
  return { title: "Trips", html: html`${head("Trips", `Next ${list.length} trip instances by date.`)}${list.length ? table(["Date", "Commuter", "Direction", "Time", "Status", "Matched"], list.map((t) => html`<tr><td>${fmtDate(t.date)}</td><td>${t.commuter} ${t.is_demo ? simBadge() : ""}</td><td>${t.direction}</td><td>${fmtTime(t.time)}</td><td>${statusBadge(t.status)}</td><td>${t.matched ? "Yes" : "No"}</td></tr>`)) : nothing("No trips yet", "Trips are generated from recurring plans.")}` };
}

const reassignment = async () => ({ title: "Reassignment", html: html`${head("Reassignment", "Trips that lost their driver and need a replacement.")}${nothing("Nothing to reassign", "When a driver cancels, affected trips appear here with replacement options. Automatic re-matching arrives with the matching engine.")}` });
const reports = async () => ({ title: "Reports", html: html`${head("Reports", "Operational analytics.")}${nothing("Reports start after the first trips", "We won't chart numbers that don't exist yet. Completed trips, punctuality and fare data will feed this page during the pilot.")}` });

async function settings() {
  const c = await api("/config");
  const row = (k, v, tone) => html`<div class="row spread" style="padding:12px 0;border-bottom:1px solid var(--line)"><span>${k}</span><span class="badge ${tone}">${v}</span></div>`;
  return { title: "Settings", html: html`${head("Settings", "Which parts of CommuteLoop are live and which are simulated.")}<div class="cols"><div class="card"><h3>Integrations</h3>
    ${row("Demo mode", c.demo_mode ? "On, simulated data present" : "Off", c.demo_mode ? "orange" : "green")}${row("OTP delivery", c.otp_test_mode ? "Test OTP, no SMS provider" : "SMS provider", c.otp_test_mode ? "orange" : "green")}${row("Maps and routing", c.maps.live ? `Live (${c.maps.provider})` : "Not connected, routes simulated", c.maps.live ? "green" : "orange")}${row("In-app notifications", "On", "green")}${row("Push notifications (FCM)", c.notifications.push_fcm ? "On" : "Not connected", c.notifications.push_fcm ? "green" : "orange")}
    <p class="small muted" style="margin-top:12px">Keys are set with environment variables on the server, never in the app.</p></div>
    <div class="card stack"><h3>Demo data</h3><p class="muted small">Adds the simulated Bengaluru Outer Ring Road scenario: three commuters, two drivers and one proposed shared auto. Does nothing if it's already there.</p><button class="btn navy" id="seed" ${c.demo_mode ? "" : "disabled"}>Load demo scenario</button></div></div>`,
    mount: (host, rerender) => $("#seed", host).addEventListener("click", async () => { try { const r = await api("/admin/demo/seed", { method: "POST" }); toast(r.seeded ? "Demo scenario loaded." : r.reason); rerender(); } catch (e) { toast(e.message, true); } }) };
}

export const adminRoutes = { "/admin": overview, "/admin/commuters": commuters, "/admin/drivers": drivers, "/admin/vehicles": vehicles, "/admin/requests": requests, "/admin/matches": matches, "/admin/trips": trips, "/admin/reassignment": reassignment, "/admin/reports": reports, "/admin/technology-demo": technologyDemo, "/admin/settings": settings };
