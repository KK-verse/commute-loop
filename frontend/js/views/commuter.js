import { api } from "../api.js";
import { $, $$, DAYS, confirmDialog, dayList, fmtDate, fmtTime, html, inr, schematicMap, simBadge, statusBadge, toast } from "../ui.js";
import { drawGoogleRoute } from "../maps.js";

export const commuterNav = [
  { href: "/app", label: "Home", icon: "home", primary: true },
  { href: "/app/commute", label: "My Commute", short: "Commute", icon: "route" },
  { href: "/app/match", label: "Find a Match", short: "Match", icon: "search", primary: true },
  { href: "/app/trips", label: "Upcoming Trips", short: "Trips", icon: "list", primary: true },
  { href: "/app/schedule", label: "Recurring Schedule", short: "Schedule", icon: "calendar", primary: true },
  { href: "/app/fares", label: "Fare and Savings", icon: "wallet" },
  { href: "/app/profile", label: "Profile", icon: "user" },
  { href: "/app/safety", label: "Safety and Support", icon: "shield" },
];

const head = (title, intro) => html`<header><h1>${title}</h1>${intro ? html`<p>${intro}</p>` : ""}</header>`;
const DIR = { morning: "Morning ride to the office", evening: "Evening ride home" };

const weekStrip = (week) => html`<div class="week" role="list">${week.map((d) => html`<div class="day ${d.is_today ? "today" : ""}" role="listitem">
  <div class="d">${d.weekday}</div><div class="n">${fmtDate(d.date, { day: "numeric", month: "short" })}</div>
  ${d.trips.length ? d.trips.map((t) => html`<span class="pill ${t.status}" title="${t.direction} ${t.status}">${t.direction === "morning" ? "AM" : "PM"} ${fmtTime(t.time).replace(" ", "")}</span>`) : html`<span class="off">No ride</span>`}</div>`)}</div>`;

const stopList = (stops) => html`<ol class="route">${stops.map((s) => html`<li><span class="dot ${s.type === "dropoff" ? "office" : s.type === "start" ? "start" : ""}"></span>
  <div><div class="t">${s.type === "dropoff" ? "Drop-off" : `Pickup ${s.sequence + 1}`}: ${s.label}</div></div><div class="t">${fmtTime(s.eta)}</div></li>`)}</ol>`;

/* ------------------------------------------------------------------ Home */
async function home(me) {
  const d = await api("/commuter/dashboard");
  if (!d.onboarding_complete) {
    return { title: "Home", html: html`${head(`Hello, ${me.full_name.split(" ")[0]}`)}<div class="card empty"><h3>Set up your commute</h3><p>Add your home, office and travel days to start.</p><a class="btn" href="/onboarding" data-link>Set up my commute</a></div>` };
  }
  const t = d.next_trip;
  const trip = t ? html`<div class="card">
      <div class="row spread wrap"><div><h3>${DIR[t.direction]}</h3><div class="muted">${fmtDate(t.date, { weekday: "long", day: "numeric", month: "long" })}${t.direction === "morning" ? ", arrive by " : ", leave at "}${fmtTime(t.target_time)}</div></div>${statusBadge(t.status, t.under_review)}</div>
      <div class="stats" style="margin-top:18px">
        <div class="stat"><div class="v">${t.pickup_time ? fmtTime(t.pickup_time) : "–"}</div><div class="l">Your pickup time</div></div>
        <div class="stat"><div class="v">${t.arrival_time ? fmtTime(t.arrival_time) : "–"}</div><div class="l">Estimated office arrival</div></div>
        <div class="stat"><div class="v">${t.fare_inr != null ? inr(t.fare_inr) : "–"}</div><div class="l">Your share of the fare</div>${t.fare_is_simulated ? html`<div class="s">Simulated estimate</div>` : ""}</div>
        <div class="stat"><div class="v">${t.fellow_passengers ?? "–"}</div><div class="l">Fellow passengers</div></div></div>
      <div style="margin-top:18px">${t.driver ? html`<div class="row"><span class="badge green">Driver</span><strong>${t.driver.name}</strong>${t.vehicle ? html`<span class="muted">${t.vehicle.category}${t.vehicle.model ? ", " + t.vehicle.model : ""}, ${t.vehicle.registration}</span>` : ""}</div>`
        : t.under_review ? html`<p class="muted">A match has been found and is waiting for an admin to review it. You'll be asked to accept or decline before anything is confirmed.</p>`
        : html`<p class="muted">No driver is assigned to this trip yet. We'll tell you when a match is proposed. Nothing is confirmed until you and the driver both accept.</p>`}</div>
      ${d.pending_proposal ? html`<div class="notice green" style="margin-top:16px"><span>A ride is waiting for your answer.</span><a class="link" href="/app/match" data-link>Review it</a></div>` : ""}</div>`
    : html`<div class="card empty"><h3>No upcoming trips</h3><p>Your recurring plan has no travel days in the next two weeks.</p><a class="btn" href="/app/schedule" data-link>Review my schedule</a></div>`;
  return { title: "Home", html: html`${head(`Hello, ${me.full_name.split(" ")[0]}`, "Here's your next commute and this week's plan.")}
    <div class="stack">${trip}
    <div class="card"><div class="row spread" style="margin-bottom:14px"><h3>This week</h3><a class="link small" href="/app/schedule" data-link>Manage schedule</a></div>${weekStrip(d.week)}</div>
    <details class="small muted"><summary style="cursor:pointer">Where these numbers come from</summary><p style="margin-top:8px">Next trip and week: ${d.data_sources.next_trip}. Driver, pickup times and fare: ${d.data_sources.driver_and_fare}. Fares marked simulated use an assumed tariff, not a live quote.</p></details></div>` };
}

/* ------------------------------------------------------------------ My Commute */
async function commute(_me, config) {
  const p = await api("/commuter/profile");
  const stops = [p.home && { lat: p.home.latitude, lng: p.home.longitude, label: "Home" }, p.office && { lat: p.office.latitude, lng: p.office.longitude, label: "Office" }].filter(Boolean);
  let route = null, routeError = "";
  if (config.maps?.routes_live && p.home && p.office) {
    try {
      route = await api("/maps/route", { method: "POST", body: {
        origin: { latitude: p.home.latitude, longitude: p.home.longitude },
        destination: { latitude: p.office.latitude, longitude: p.office.longitude },
      } });
    } catch (e) { routeError = e.message; }
  }
  const row = (k, v) => html`<div class="row spread" style="padding:10px 0;border-bottom:1px solid var(--line)"><span class="muted">${k}</span><strong style="text-align:right">${v}</strong></div>`;
  const km = route ? (route.distance_meters / 1000).toLocaleString("en-IN", { maximumFractionDigits: 1 }) : null;
  const minutes = route ? Math.max(1, Math.round(route.duration_seconds / 60)) : null;
  const map = route && config.maps?.browser_key
    ? html`<div class="google-map" data-commute-google-map aria-label="Google Maps commute route"></div>`
    : route ? html`<div class="card small muted">Google road route calculated. Add a browser key to show the map.</div>`
    : html`${schematicMap(stops, { caption: "Schematic, not a road route" })}<p class="small muted">${routeError || (config.maps?.routes_live ? "Live road route unavailable right now; this location sketch is illustrative." : "Google road routes are not connected yet. This location sketch is illustrative and has no route or ETA.")}</p>`;
  return { title: "My Commute", html: html`${head("My Commute", "The journey we plan rides around.")}
    <div class="cols"><div class="stack"><div class="card"><h3>Route</h3>${row("Home", p.home?.label || "–")}${row("Pickup point", p.home?.pickup_label || "–")}${row("Office", `${p.company_name || ""} · ${p.office?.label || "–"}`)}${row("Drop-off point", p.office?.pickup_label || "–")}</div>
      <div class="card"><h3>Timing and days</h3>${row("Reach the office by", fmtTime(p.arrival_time))}${row("Leave the office at", p.departure_time ? fmtTime(p.departure_time) : "No return ride")}${row("Travel days", dayList(p.working_days))}</div>
      <div class="card"><h3>Preferences</h3>${row("Vehicle", p.preferred_vehicle === "any" ? "Any available" : p.preferred_vehicle)}${row("Extra travel time allowed", `${p.max_extra_minutes} min`)}${row("Same driver and group", p.prefers_fixed_group ? "Preferred" : "Not needed")}${row("Other compatible matches", p.accepts_alternative_matches ? "Welcome" : "No")}</div>
      <a class="btn" href="/onboarding?edit=1" data-link>Edit my commute</a></div>
    <div class="stack">${map}${route ? html`<div class="route-stats"><strong>${km} km</strong><strong>~${minutes} min</strong><span>Google road route · current traffic estimate, not a booked-trip ETA</span></div>` : ""}</div></div>`,
    mount: (host) => {
      if (route && config.maps?.browser_key) {
        const canvas = host.querySelector("[data-commute-google-map]");
        drawGoogleRoute(canvas, route, p.home, p.office, config.maps.browser_key).catch(() => {});
      }
    } };
}

/* ------------------------------------------------------------------ Find a match */
async function match() {
  const [props, dash] = await Promise.all([api("/commuter/proposals"), api("/commuter/dashboard")]);
  if (!props.length) {
    return { title: "Find a Match", html: html`${head("Find a Match", "Proposed rides appear here for you to accept or decline.")}
      <div class="card empty"><h3>No ride proposed yet</h3><p>${dash.next_trip?.under_review ? "A match is being reviewed by our team. You'll get a notification when it's ready." : "We're looking for riders and a verified driver whose routes and times fit yours. We won't confirm anything you haven't accepted."}</p><a class="btn ghost" href="/app/commute" data-link>Check my commute details</a></div>` };
  }
  const cards = props.map((g) => {
    const mine = g.participants.find((x) => x.commuter_id === g.you);
    const pending = mine && mine.response === "pending" && g.status === "approved";
    return html`<article class="card stack" data-g="${g.id}">
      <div class="row spread wrap"><div><h3>${fmtDate(g.date, { weekday: "long", day: "numeric", month: "long" })}</h3><div class="muted">${g.direction === "morning" ? "Morning ride to the office" : "Evening ride home"}</div></div>
        <div class="row">${g.status === "confirmed" ? html`<span class="badge green">Confirmed</span>` : html`<span class="badge orange">Waiting for answers</span>`}${g.is_demo ? simBadge() : ""}</div></div>
      <div class="cols"><div>${stopList(g.stops)}</div><div>${schematicMap(g.stops, { height: 240, caption: g.route_is_simulated ? "Simulated route" : "Route" })}</div></div>
      <div class="row wrap"><span class="badge green">Driver</span><strong>${g.driver?.name}</strong><span class="muted">${g.vehicle?.category}, ${g.vehicle?.registration}</span><span class="badge">${g.capacity_used} of ${g.capacity} seats used</span></div>
      <div class="stats"><div class="stat"><div class="v">${fmtTime(mine?.pickup_time)}</div><div class="l">Your pickup</div></div><div class="stat"><div class="v">${fmtTime(mine?.arrival_time)}</div><div class="l">Office arrival</div></div>
        <div class="stat"><div class="v">${inr(mine?.fare_inr)}</div><div class="l">Your share${mine?.distance_km ? ` (${mine.distance_km} km)` : ""}</div>${mine?.fare_is_simulated ? html`<div class="s">Simulated tariff</div>` : ""}</div>
        <div class="stat"><div class="v">${inr(mine?.saving_inr)}</div><div class="l">Saving vs riding alone</div>${mine?.fare_is_simulated ? html`<div class="s">Estimate</div>` : ""}</div></div>
      <p class="small muted">Fellow riders: ${g.participants.filter((x) => x.commuter_id !== g.you).map((x) => x.name).join(", ") || "none"}. The driver has ${g.driver_response === "accepted" ? "accepted" : "not yet accepted"}.</p>
      ${pending ? html`<div class="row wrap"><button class="btn" data-a="1">Accept this ride</button><button class="btn danger" data-a="0">Decline</button></div>` : mine ? html`<p class="badge ${mine.response === "accepted" ? "green" : ""}">You ${mine.response === "accepted" ? "accepted" : "haven't answered"}</p>` : ""}</article>`;
  });
  return { title: "Find a Match", html: html`${head("Find a Match", "Review the pickup order, timings and your fare. Nothing is confirmed until everyone accepts.")}<div class="stack">${cards}</div>`,
    mount: (host, rerender) => $$("[data-a]", host).forEach((b) => b.addEventListener("click", async () => {
      const gid = b.closest("[data-g]").dataset.g, accept = b.dataset.a === "1";
      if (!accept && !(await confirmDialog({ title: "Decline this ride?", body: "We'll keep looking for another match for this trip.", confirmText: "Decline", danger: true }))) return;
      try { const r = await api(`/commuter/proposals/${gid}/respond`, { method: "POST", body: { accept } }); toast(accept ? (r.group_status === "confirmed" ? "Ride confirmed." : "Accepted. Waiting for the others.") : "Declined."); rerender(); } catch (e) { toast(e.message, true); }
    })) };
}

/* ------------------------------------------------------------------ Trips */
async function trips() {
  const list = await api("/commuter/trips");
  const body = !list.length ? html`<div class="card empty"><h3>No upcoming trips</h3><p>Trips are created from your recurring plan.</p><a class="btn" href="/app/schedule" data-link>Open my schedule</a></div>` :
    html`<div class="stack">${list.map((t) => html`<div class="card row spread wrap" data-t="${t.id}" style="gap:16px">
      <div class="grow"><div class="row wrap"><strong style="font-family:var(--f-display);font-size:1.1rem">${fmtDate(t.date)}</strong>${statusBadge(t.status, t.under_review)}${t.is_demo ? simBadge() : ""}</div>
        <div class="muted small" style="margin-top:4px">${t.direction === "morning" ? `Morning, arrive by ${fmtTime(t.target_time)}` : `Evening, leave at ${fmtTime(t.target_time)}`}${t.pickup_time ? `, pickup ${fmtTime(t.pickup_time)}` : ""}${t.driver ? `, driver ${t.driver.name}` : ""}</div></div>
      ${t.status === "SKIPPED" ? html`<button class="btn ghost sm" data-undo>Ride on this day again</button>` : ["COMPLETED", "CANCELLED", "IN_PROGRESS"].includes(t.status) ? "" : html`<button class="btn ghost sm" data-skip>Skip this day</button>`}</div>`)}</div>`;
  return { title: "Upcoming Trips", html: html`${head("Upcoming Trips", "Skipping a day only affects that day. Your recurring plan stays active.")}${body}`,
    mount: (host, rerender) => {
      $$("[data-skip]", host).forEach((b) => b.addEventListener("click", async () => {
        const id = b.closest("[data-t]").dataset.t, t = list.find((x) => x.id === id);
        if (!(await confirmDialog({ title: `Skip ${fmtDate(t.date)}?`, body: "Only this day is skipped. Other days and your plan stay as they are.", confirmText: "Skip this day", danger: true }))) return;
        try { await api(`/commuter/trips/${id}/skip`, { method: "POST", body: {} }); toast("Skipped. Your plan is still active."); rerender(); } catch (e) { toast(e.message, true); }
      }));
      $$("[data-undo]", host).forEach((b) => b.addEventListener("click", async () => {
        try { await api(`/commuter/trips/${b.closest("[data-t]").dataset.t}/unskip`, { method: "POST" }); toast("Back on. We'll look for a match."); rerender(); } catch (e) { toast(e.message, true); }
      }));
    } };
}

/* ------------------------------------------------------------------ Schedule */
async function schedule() {
  const [plans, d] = await Promise.all([api("/commuter/schedule"), api("/commuter/dashboard")]);
  const body = !plans.length ? html`<div class="card empty"><h3>No recurring plan yet</h3><a class="btn" href="/onboarding" data-link>Set up my commute</a></div>` :
    html`<div class="grid2">${plans.map((p) => html`<div class="card"><div class="row spread"><h3>${p.direction === "morning" ? "Morning to office" : "Evening to home"}</h3><span class="badge ${p.is_active ? "green" : ""}">${p.is_active ? "Active" : "Paused"}</span></div>
      <p style="margin-top:10px"><strong>${p.direction === "morning" ? "Arrive by " : "Leave at "}${fmtTime(p.time)}</strong></p><p class="muted">${dayList(p.weekdays)}</p><p class="muted small">From ${fmtDate(p.start_date, { day: "numeric", month: "short", year: "numeric" })}${p.end_date ? ` to ${fmtDate(p.end_date, { day: "numeric", month: "short", year: "numeric" })}` : ", no end date"}</p></div>`)}</div>
      <div class="card" style="margin-top:18px"><h3 style="margin-bottom:14px">This week</h3>${weekStrip(d.week)}</div><p style="margin-top:18px"><a class="btn" href="/onboarding?edit=1" data-link>Change days or times</a></p>`;
  return { title: "Recurring Schedule", html: html`${head("Recurring Schedule", "Each travel day becomes its own trip, so a skipped day never cancels the plan.")}${body}` };
}

/* ------------------------------------------------------------------ Fares */
async function fares() {
  const props = await api("/commuter/proposals");
  const mineAll = props.map((g) => ({ g, m: g.participants.find((x) => x.commuter_id === g.you) })).filter((x) => x.m && x.m.fare_inr != null);
  if (!mineAll.length) return { title: "Fare and Savings", html: html`${head("Fare and Savings", "Your share of each shared ride, and what it saves compared with riding alone.")}<div class="card empty"><h3>No fare yet</h3><p>Your fare appears here when a ride is proposed to you. We don't show a fare we can't calculate.</p></div>` };
  const sim = mineAll.some((x) => x.m.fare_is_simulated);
  const daily = mineAll[0].m;
  return { title: "Fare and Savings", html: html`${head("Fare and Savings", "Each rider pays in proportion to their own distance on the shared route.")}
    ${sim ? html`<div class="notice" style="margin-bottom:16px"><span>${simBadge()} These fares use an assumed auto tariff (₹36 for the first 2 km, ₹18 per extra km). They are estimates, not live quotes.</span></div>` : ""}
    <div class="table-wrap"><table><thead><tr><th>Date</th><th>Distance</th><th>Riding alone</th><th>Your share</th><th>Saving</th></tr></thead><tbody>
      ${mineAll.map(({ g, m }) => html`<tr><td>${fmtDate(g.date)}</td><td>${m.distance_km} km</td><td>${inr(m.solo_fare_inr)}</td><td><strong>${inr(m.fare_inr)}</strong></td><td>${inr(m.saving_inr)}</td></tr>`)}</tbody></table></div>
    <div class="card" style="margin-top:18px"><h3>If every working day looked like this</h3><p class="muted" style="margin-top:6px">22 working days, a morning and evening ride at the same fare: about <strong>${inr(daily.saving_inr * 2 * 22)}</strong> saved in a month${sim ? " (simulated estimate)" : ""}. Real savings depend on who you ride with and verified route distances.</p></div>` };
}

/* ------------------------------------------------------------------ Profile */
async function profile(me) {
  const p = await api("/commuter/profile");
  const row = (k, v) => html`<div class="row spread" style="padding:10px 0;border-bottom:1px solid var(--line)"><span class="muted">${k}</span><strong>${v || "–"}</strong></div>`;
  return { title: "Profile", html: html`${head("Profile")}<div class="cols"><div class="card"><h3 style="margin-bottom:6px">Your details</h3>${row("Name", p.full_name)}${row("Mobile", p.phone)}${row("Email", p.email)}${row("City", p.city)}${row("Company", p.company_name)}<p style="margin-top:16px"><a class="btn" href="/onboarding?edit=1" data-link>Edit details</a></p></div>
    <div class="card"><h3>Account</h3><p class="muted" style="margin:6px 0 14px">Signing out ends this session on this device. Your commute and profile stay saved.</p><button class="btn ghost" id="so">Sign out</button></div></div>`,
    mount: (h) => $("#so", h).addEventListener("click", () => (document.getElementById("logout") || document.getElementById("logout2")).click()) };
}

/* ------------------------------------------------------------------ Safety */
async function safety() {
  const contacts = await api("/commuter/emergency-contacts");
  return { title: "Safety and Support", html: html`${head("Safety and Support", "Keep someone close in the loop, and tell us if something goes wrong.")}
    <div class="notice red" style="margin-bottom:18px"><span>In an emergency, call <strong>112</strong> first.</span></div>
    <div class="cols"><div class="card stack"><h3>Emergency contacts</h3>
      ${contacts.length ? html`<ul style="list-style:none;margin:0;padding:0">${contacts.map((c) => html`<li class="row spread" style="padding:10px 0;border-bottom:1px solid var(--line)"><div><strong>${c.name}</strong>${c.relationship ? html` <span class="muted">(${c.relationship})</span>` : ""}<div class="small muted">${c.phone}</div></div><button class="btn danger sm" data-del="${c.id}" aria-label="Remove ${c.name}">Remove</button></li>`)}</ul>` : html`<p class="muted">No contacts yet. Add up to five people.</p>`}
      <form id="fc" class="stack" novalidate><div class="grid2"><label class="field"><span class="lbl">Name</span><input type="text" name="name" required></label><label class="field"><span class="lbl">Mobile number</span><input type="tel" name="phone" required></label></div>
      <label class="field"><span class="lbl">Relationship (optional)</span><input type="text" name="rel" placeholder="Parent, friend, partner"></label><button class="btn">Add contact</button></form></div>
    <div class="card stack"><h3>Report a problem</h3><p class="muted small">Our team reviews every report.</p><form id="fi" class="stack" novalidate>
      <label class="field"><span class="lbl">What happened?</span><select name="cat"><option value="driver_behaviour">Driver behaviour</option><option value="route_or_timing">Route or timing</option><option value="rider_behaviour">Fellow rider behaviour</option><option value="vehicle">Vehicle condition</option><option value="other">Something else</option></select></label>
      <label class="field"><span class="lbl">How serious is it?</span><select name="sev"><option value="low">Low</option><option value="medium" selected>Medium</option><option value="high">High</option><option value="critical">Urgent</option></select></label>
      <label class="field"><span class="lbl">Details</span><textarea name="desc" required minlength="5"></textarea></label><button class="btn navy">Send report</button></form>
      <p class="small muted">Live trip sharing and an in-app SOS button arrive in a later phase. They are not available yet.</p></div></div>`,
    mount: (host, rerender) => {
      $("#fc", host).addEventListener("submit", async (e) => { e.preventDefault(); const f = e.target; try { await api("/commuter/emergency-contacts", { method: "POST", body: { name: f.name.value, phone: f.phone.value, relationship_label: f.rel.value || null } }); toast("Contact added."); rerender(); } catch (er) { toast(er.message, true); } });
      $$("[data-del]", host).forEach((b) => b.addEventListener("click", async () => { try { await api(`/commuter/emergency-contacts/${b.dataset.del}`, { method: "DELETE" }); toast("Removed."); rerender(); } catch (er) { toast(er.message, true); } }));
      $("#fi", host).addEventListener("submit", async (e) => { e.preventDefault(); const f = e.target; try { await api("/commuter/incidents", { method: "POST", body: { category: f.cat.value, severity: f.sev.value, description: f.desc.value } }); toast("Report sent. Thank you."); f.reset(); } catch (er) { toast(er.message, true); } });
    } };
}

export const commuterRoutes = { "/app": home, "/app/commute": commute, "/app/match": match, "/app/trips": trips, "/app/schedule": schedule, "/app/fares": fares, "/app/profile": profile, "/app/safety": safety };
