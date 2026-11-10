import { api, session } from "../api.js";
import { $, $$, DAYS, html, icon, logo, schematicMap, simBadge } from "../ui.js";
import { drawGooglePoint, drawGoogleRoute, mountPlaceSearch } from "../maps.js";

// Illustrative places so the flow works before a maps key is configured. Coordinates are approximate
// and are saved with geocode_source = "demo", never presented as geocoded addresses.
const PLACES = {
  Bengaluru: [
    ["Marathahalli", "Marathahalli, Bengaluru", 12.9569, 77.7011], ["Bellandur", "Bellandur, Bengaluru", 12.9304, 77.6784],
    ["Kadubeesanahalli", "Kadubeesanahalli, Bengaluru", 12.9366, 77.6906], ["HSR Layout", "HSR Layout, Bengaluru", 12.9116, 77.6389],
    ["Sarjapur Road", "Sarjapur Road, Bengaluru", 12.9138, 77.683], ["Embassy TechVillage (ORR)", "Devarabisanahalli, Bengaluru", 12.923, 77.687],
  ],
  Hyderabad: [
    ["Madhapur", "Madhapur, Hyderabad", 17.4486, 78.3908], ["HITEC City", "HITEC City, Hyderabad", 17.4435, 78.3772],
    ["Gachibowli", "Gachibowli, Hyderabad", 17.4401, 78.3489], ["Kondapur", "Kondapur, Hyderabad", 17.4637, 78.3646],
  ],
  "Delhi NCR": [
    ["Cyber Hub, Gurugram", "DLF Cyber City, Gurugram", 28.495, 77.089], ["Noida Sector 62", "Sector 62, Noida", 28.627, 77.3649],
    ["Dwarka", "Dwarka, New Delhi", 28.5921, 77.046], ["Saket", "Saket, New Delhi", 28.5245, 77.2066],
  ],
};
const CITIES = ["Bengaluru", "Hyderabad", "Delhi NCR"];
const chipDays = (name, sel) => html`<div class="chips" role="group" aria-label="Travel days">${DAYS.map((d, i) => html`<label class="chip"><input type="checkbox" name="${name}" value="${i}" ${sel.includes(i) ? "checked" : ""}><span>${d}</span></label>`)}</div>`;
const val = (v) => (v == null ? "" : v);

function locationPicker(prefix, city, loc, label, config) {
  const places = PLACES[city] || [];
  const l = loc || {};
  const preview = l.latitude != null && !config.maps?.browser_key ? schematicMap([{ lat: l.latitude, lng: l.longitude, label: l.label }], { height: 200, caption: "Illustrative location preview" }) : "";
  return html`<div class="stack" data-loc="${prefix}">
    ${config.maps?.places_live ? html`<label class="field"><span class="lbl">Search with Google Maps</span><div class="google-place-search" data-place-search></div>
      <span class="hint">Google receives the place search so it can return matching locations.</span></label>` : ""}
    <label class="field"><span class="lbl">Choose a place</span>
      <select name="${prefix}_preset"><option value="">Enter details manually</option>
      ${places.map((p, i) => html`<option value="${i}" ${l.label === p[0] ? "selected" : ""}>${p[0]}</option>`)}</select>
      <span class="hint">${config.maps?.places_live ? "Or use an illustrative area or enter the details yourself." : "Google address search turns on when a browser key is configured. Until then, these areas are illustrative; enter and confirm your own details."}</span></label>
    <input type="hidden" name="${prefix}_place_id" value="${val(l.place_id)}">
    <input type="hidden" name="${prefix}_source" value="${val(l.geocode_source || "manual")}">
    <div class="grid2">
      <label class="field"><span class="lbl">Place name</span><input type="text" name="${prefix}_label" required value="${val(l.label)}"></label>
      <label class="field"><span class="lbl">Address</span><input type="text" name="${prefix}_address" required value="${val(l.address)}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span class="lbl">Latitude</span><input type="number" step="any" name="${prefix}_lat" required value="${val(l.latitude)}"></label>
      <label class="field"><span class="lbl">Longitude</span><input type="number" step="any" name="${prefix}_lng" required value="${val(l.longitude)}"></label>
    </div>
    <label class="field"><span class="lbl">Preferred pickup point</span><input type="text" name="${prefix}_pickup" placeholder="e.g. Main gate, bus stop opposite the mall" value="${val(l.pickup_label)}"><span class="hint">A safe, easy spot where a vehicle can stop.</span></label>
    <div data-preview="${prefix}">${preview}</div>
    ${config.maps?.browser_key ? html`<div class="google-map" data-google-map aria-label="Google Maps location preview"></div><div class="small muted" data-map-message></div>` : ""}
    ${prefix === "office" ? html`<div class="route-preview" data-route-preview aria-live="polite"><div class="small muted">Choose both places to preview the road route.</div></div>` : ""}
    <label class="check"><input type="checkbox" name="${prefix}_confirmed" ${l.confirmed ? "checked" : ""}><span><strong>This is the right spot</strong><br><span class="small muted">I've checked the location and pickup point.</span></span></label>
  </div>`;
}

function readLocation(form, prefix) {
  const g = (n) => form.elements[`${prefix}_${n}`];
  const lat = parseFloat(g("lat").value), lng = parseFloat(g("lng").value);
  if (!g("label").value.trim() || !g("address").value.trim()) return { error: "Add a place name and address." };
  if (Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return { error: "Enter valid latitude and longitude." };
  if (!g("confirmed").checked) return { error: "Please confirm the location is correct." };
  return { value: { label: g("label").value.trim(), address: g("address").value.trim(), latitude: lat, longitude: lng,
    pickup_label: g("pickup").value.trim() || null, pickup_latitude: lat, pickup_longitude: lng, confirmed: true,
    geocode_source: g("source").value || "manual", place_id: g("place_id").value || null } };
}

function wirePickerLegacy(form, city) {
  $$("[data-loc]", form).forEach((box) => {
    const prefix = box.dataset.loc;
    const g = (n) => form.elements[`${prefix}_${n}`];
    const redraw = () => {
      const lat = parseFloat(g("lat").value), lng = parseFloat(g("lng").value);
      $(`[data-preview=${prefix}]`, form).innerHTML = Number.isNaN(lat) || Number.isNaN(lng) ? "" :
        schematicMap([{ lat, lng, label: g("label").value }], { height: 200, caption: "Schematic preview" }).s;
    };
    g("preset").addEventListener("change", () => {
      const p = PLACES[city][g("preset").value];
      if (!p) return;
      g("label").value = p[0]; g("address").value = p[1]; g("lat").value = p[2]; g("lng").value = p[3]; g("confirmed").checked = false; redraw();
    });
    ["lat", "lng", "label"].forEach((n) => g(n).addEventListener("change", redraw));
  });
}

function wirePicker(form, city, config, routeOrigin = null) {
  const cleanups = [];
  form.querySelectorAll("[data-loc]").forEach((box) => {
    const prefix = box.dataset.loc;
    const g = (name) => form.elements[`${prefix}_${name}`];
    const canvas = box.querySelector("[data-google-map]");
    const routeBox = box.querySelector("[data-route-preview]");
    const showStatus = (message) => {
      const messageBox = box.querySelector("[data-map-message]");
      if (messageBox) messageBox.textContent = message;
      if (routeBox) {
        routeBox.replaceChildren();
        const text = document.createElement("div");
        text.className = "small muted";
        text.textContent = message;
        routeBox.append(text);
      }
    };
    let routeTimer, routeSequence = 0, pointSignature = "";
    cleanups.push(() => { clearTimeout(routeTimer); routeSequence++; });
    const coords = () => ({ latitude: parseFloat(g("lat").value), longitude: parseFloat(g("lng").value) });
    const valid = (p) => Number.isFinite(p.latitude) && Number.isFinite(p.longitude);
    const updatePoint = () => {
      const point = coords();
      if (!canvas || !config.maps?.browser_key || !valid(point)) return;
      const signature = `${point.latitude}:${point.longitude}:${g("label").value}`;
      if (signature === pointSignature) return;
      pointSignature = signature;
      drawGooglePoint(canvas, { ...point, label: g("label").value }, config.maps.browser_key).catch((e) => showStatus(e.message));
    };
    const updateRoute = () => {
      if (!routeBox || !routeOrigin) return;
      const destination = coords();
      if (!valid(destination)) { clearTimeout(routeTimer); routeSequence++; showStatus("Choose both places to preview the road route."); return; }
      if (!config.maps?.routes_live) {
        showStatus("Google road routing is not configured yet. Your saved commute still appears in your account and the admin request list.");
        updatePoint();
        return;
      }
      clearTimeout(routeTimer);
      routeSequence++;
      showStatus("Calculating a Google road route…");
      const sequence = ++routeSequence;
      routeTimer = setTimeout(async () => {
        try {
          const result = await api("/maps/route", { method: "POST", body: {
            origin: { latitude: routeOrigin.latitude, longitude: routeOrigin.longitude }, destination,
          } });
          if (!box.isConnected || sequence !== routeSequence) return;
          const km = (result.distance_meters / 1000).toLocaleString("en-IN", { maximumFractionDigits: 1 });
          const minutes = Math.max(1, Math.round(result.duration_seconds / 60));
          routeBox.innerHTML = `<div class="route-stats"><strong>${km} km</strong><strong>~${minutes} min</strong><span>Google road route · current traffic estimate</span></div>`;
          const messageBox = box.querySelector("[data-map-message]");
          if (messageBox) messageBox.textContent = "";
          if (canvas && config.maps?.browser_key) {
            drawGoogleRoute(canvas, result, routeOrigin, destination, config.maps.browser_key)
              .catch((e) => showStatus(e.message));
          }
        } catch (e) {
          if (box.isConnected && sequence === routeSequence) showStatus(e.message);
        }
      }, 450);
    };
    const redraw = () => {
      const point = coords();
      const fallback = box.querySelector(`[data-preview=${prefix}]`);
      if (fallback) fallback.innerHTML = !config.maps?.browser_key && valid(point)
        ? schematicMap([{ lat: point.latitude, lng: point.longitude, label: g("label").value }], { height: 200, caption: "Illustrative location preview" }).s
        : "";
      updatePoint();
      updateRoute();
    };
    g("preset").addEventListener("change", () => {
      const place = PLACES[city]?.[g("preset").value];
      g("place_id").value = "";
      if (!place) { g("source").value = "manual"; return; }
      g("source").value = "demo";
      g("label").value = place[0]; g("address").value = place[1];
      g("lat").value = place[2]; g("lng").value = place[3];
      g("confirmed").checked = false; pointSignature = ""; redraw();
    });
    ["lat", "lng", "label", "address"].forEach((name) => g(name).addEventListener("input", () => {
      g("source").value = "manual"; g("place_id").value = ""; g("confirmed").checked = false;
    }));
    ["lat", "lng", "label"].forEach((name) => g(name).addEventListener("change", redraw));
    const search = box.querySelector("[data-place-search]");
    if (search && config.maps?.browser_key) {
      mountPlaceSearch(search, { apiKey: config.maps.browser_key, city,
        onSelect: (place) => {
          g("label").value = place.label; g("address").value = place.address;
          g("lat").value = place.latitude; g("lng").value = place.longitude;
          g("place_id").value = place.place_id || ""; g("source").value = "google";
          g("preset").value = ""; g("confirmed").checked = false; pointSignature = ""; redraw();
        },
        onError: (error) => showStatus(error.message),
      }).catch((error) => showStatus(error.message));
    }
    redraw();
  });
  return () => cleanups.forEach((cleanup) => cleanup());
}

/* ------------------------------------------------------------------ wizard engine */
function wizard(root, { title, intro, steps, state, submit, edit }) {
  let i = 0;
  let stepCleanup = null;
  const paint = (error = "") => {
    stepCleanup?.();
    stepCleanup = null;
    const s = steps[i];
    root.innerHTML = html`<main class="wizard" id="main">
      <div class="row spread">${logo()}${edit ? html`<a class="link small" href="${state._back}" data-link>Cancel</a>` : ""}</div>
      <h1 style="margin-top:26px;font-size:clamp(1.6rem,3.4vw,2.1rem)">${edit ? "Edit your details" : title}</h1>
      <p class="muted" style="margin-top:6px">${edit ? "Changes apply to future trips." : intro}</p>
      <div class="steps" role="img" aria-label="Step ${i + 1} of ${steps.length}">${steps.map((_, k) => html`<i class="${k < i ? "on" : k === i ? "now" : ""}"></i>`)}</div>
      <form id="wf" class="card stack" novalidate><h2 style="font-size:1.35rem">${s.title}</h2>${s.sub ? html`<p class="muted small" style="margin-top:-6px">${s.sub}</p>` : ""}${s.render(state)}
        ${error ? html`<div class="notice red" role="alert">${error}</div>` : ""}
        <div class="row spread" style="padding-top:8px">${i ? html`<button type="button" class="btn ghost" id="back">Back</button>` : html`<span></span>`}
        <button class="btn" id="next">${i === steps.length - 1 ? (edit ? "Save changes" : "Save and continue") : "Next"}</button></div></form></main>`.s;
    const form = $("#wf");
    stepCleanup = s.wire?.(form, state) || null;
    $("#back")?.addEventListener("click", () => { s.collect(form, state, true); i--; paint(); });
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = s.collect(form, state);
      if (err) { paint(err); return; }
      if (i < steps.length - 1) { i++; paint(); return; }
      const btn = $("#next"); btn.disabled = true; btn.textContent = "Saving…";
      try { await submit(state); } catch (ex) { paint(ex.message); }
    });
    window.scrollTo(0, 0);
    $("#wf input, #wf select")?.focus({ preventScroll: true });
  };
  paint();
}

/* ------------------------------------------------------------------ commuter */
async function commuterFlow(root, me, config, onDone, edit) {
  const p = edit ? await api("/commuter/profile").catch(() => ({})) : {};
  const s = {
    _back: "/app/commute", full_name: p.full_name || me.full_name, email: p.email || "", city: p.city || "Bengaluru",
    company_name: p.company_name || "", home: p.home || null, office: p.office || null,
    arrival_time: p.arrival_time || "09:00", departure_time: p.departure_time === undefined ? "18:00" : p.departure_time,
    no_return: edit && p.onboarding_complete && !p.departure_time, working_days: p.working_days?.length ? p.working_days : [0, 1, 2, 3, 4],
    preferred_vehicle: p.preferred_vehicle || "any", max_extra_minutes: p.max_extra_minutes ?? 15,
    prefers_fixed_group: !!p.prefers_fixed_group, accepts_alternative_matches: p.accepts_alternative_matches ?? true,
    start_date: new Date().toISOString().slice(0, 10),
  };
  const steps = [
    { title: "About you", sub: "So drivers and fellow riders know who to expect.",
      render: (s) => html`<label class="field"><span class="lbl">Full name</span><input type="text" name="name" required value="${s.full_name}" autocomplete="name"></label>
        <label class="field"><span class="lbl">Email (optional)</span><input type="email" name="email" value="${s.email}" autocomplete="email"></label>
        <label class="field"><span class="lbl">City</span><select name="city">${CITIES.map((c) => html`<option ${c === s.city ? "selected" : ""}>${c}</option>`)}</select></label>`,
      collect: (f, s, soft) => { s.full_name = f.name.value.trim(); s.email = f.email.value.trim(); s.city = f.city.value; if (!soft && s.full_name.length < 2) return "Enter your full name."; } },
    { title: "Where you start", sub: "Your home and the spot where you'd like to be picked up.",
      render: (s) => locationPicker("home", s.city, s.home, "Home", config), wire: (f, s) => wirePicker(f, s.city, config),
      collect: (f, s, soft) => { const r = readLocation(f, "home"); if (r.error) return soft ? null : r.error; s.home = r.value; } },
    { title: "Where you work", sub: "Your office and where you'd like to be dropped.",
      render: (s) => html`<label class="field"><span class="lbl">Company or office name</span><input type="text" name="company" required value="${s.company_name}"></label>${locationPicker("office", s.city, s.office, "Office", config)}`,
      wire: (f, s) => wirePicker(f, s.city, config, s.home),
      collect: (f, s, soft) => { s.company_name = f.company.value.trim(); const r = readLocation(f, "office"); if (soft) return; if (s.company_name.length < 2) return "Enter your company name."; if (r.error) return r.error; s.office = r.value; } },
    { title: "Your schedule", sub: "Morning and evening can differ. We create a separate trip for each travel day.",
      render: (s) => html`<div class="grid2"><label class="field"><span class="lbl">Reach the office by</span><input type="time" name="arr" required value="${s.arrival_time}"><span class="hint">Your latest acceptable arrival.</span></label>
        <label class="field"><span class="lbl">Leave the office at</span><input type="time" name="dep" value="${s.departure_time || ""}" ${s.no_return ? "disabled" : ""}></label></div>
        <label class="check"><input type="checkbox" name="noret" ${s.no_return ? "checked" : ""}><span>I don't need a return ride</span></label>
        <div><span class="lbl" style="font-weight:600;font-size:.9rem;display:block;margin-bottom:8px">Travel days</span>${chipDays("days", s.working_days)}
        <div class="row wrap" style="margin-top:10px"><button type="button" class="btn ghost sm" data-preset="0,1,2,3,4">Monday to Friday</button><button type="button" class="btn ghost sm" data-preset="0,1,2,3,4,5">Monday to Saturday</button></div></div>
        <label class="field"><span class="lbl">Start date</span><input type="date" name="start" value="${s.start_date}" required></label>`,
      wire: (f) => {
        f.elements.noret.addEventListener("change", () => { f.elements.dep.disabled = f.elements.noret.checked; });
        $$("[data-preset]", f).forEach((b) => b.addEventListener("click", () => { const set = b.dataset.preset.split(","); $$("input[name=days]", f).forEach((c) => { c.checked = set.includes(c.value); }); }));
      },
      collect: (f, s, soft) => { s.arrival_time = f.arr.value; s.no_return = f.noret.checked; s.departure_time = s.no_return ? null : f.dep.value || null; s.working_days = $$("input[name=days]:checked", f).map((c) => +c.value); s.start_date = f.start.value;
        if (soft) return; if (!s.arrival_time) return "Choose your office arrival time."; if (!s.no_return && !s.departure_time) return "Choose a return time or tick 'I don't need a return ride'."; if (!s.working_days.length) return "Choose at least one travel day."; } },
    { title: "Ride preferences", sub: "These limits are hard rules: we won't propose a ride that breaks them.",
      render: (s) => html`<label class="field"><span class="lbl">Preferred vehicle</span><select name="veh">${[["any", "Any available"], ["auto", "Auto-rickshaw"], ["taxi", "Taxi"], ["bike", "Bike"]].map(([v, l]) => html`<option value="${v}" ${s.preferred_vehicle === v ? "selected" : ""}>${l}</option>`)}</select></label>
        <label class="field"><span class="lbl">Most extra travel time you'll accept: <output id="dv">${s.max_extra_minutes}</output> min</span><input class="range" type="range" name="detour" min="0" max="60" step="5" value="${s.max_extra_minutes}"><span class="hint">Extra time compared with travelling alone on the same route.</span></label>
        <label class="check"><input type="checkbox" name="fixed" ${s.prefers_fixed_group ? "checked" : ""}><span><strong>I prefer the same driver and group</strong><br><span class="small muted">We'll try to keep you together.</span></span></label>
        <label class="check"><input type="checkbox" name="alt" ${s.accepts_alternative_matches ? "checked" : ""}><span><strong>Suggest other compatible matches</strong><br><span class="small muted">If my usual ride isn't available.</span></span></label>`,
      wire: (f) => f.detour.addEventListener("input", () => { $("#dv").textContent = f.detour.value; }),
      collect: (f, s) => { s.preferred_vehicle = f.veh.value; s.max_extra_minutes = +f.detour.value; s.prefers_fixed_group = f.fixed.checked; s.accepts_alternative_matches = f.alt.checked; } },
  ];
  wizard(root, { title: "Set up your commute", intro: "A few details so we can plan a ride that fits your day.", steps, state: s, edit,
    submit: async (s) => {
      await api("/commuter/onboarding", { method: "PUT", body: { full_name: s.full_name, email: s.email || null, company_name: s.company_name, city: s.city, home: s.home, office: s.office,
        arrival_time: s.arrival_time, departure_time: s.departure_time, working_days: s.working_days, preferred_vehicle: s.preferred_vehicle, max_extra_minutes: s.max_extra_minutes,
        prefers_fixed_group: s.prefers_fixed_group, accepts_alternative_matches: s.accepts_alternative_matches, start_date: s.start_date } });
      const u = await api("/auth/me"); session.setUser(u); onDone(u);
    } });
}

/* ------------------------------------------------------------------ driver */
async function driverFlow(root, me, config, onDone, edit) {
  const p = edit ? await api("/driver/profile").catch(() => ({})) : {};
  const v = p.vehicle || {};
  const s = { _back: "/driver/profile", full_name: p.full_name || me.full_name, email: p.email || "", city: p.city || "Bengaluru", licence_number: p.licence_number || "", licence_expiry: p.licence_expiry || "",
    reg: v.registration_number || "", category: v.category || "auto", model: v.model || "", capacity: v.permitted_passenger_capacity ?? "", ins_provider: v.insurance_provider || "", ins_policy: v.insurance_policy_number || "",
    ins_expiry: v.insurance_expiry || "", permit: v.permit_number || "", areas: p.service_areas || [], days: p.available_days?.length ? p.available_days : [0, 1, 2, 3, 4],
    ms: p.morning_start || "07:30", me: p.morning_end || "10:00", es: p.evening_start || "17:30", ee: p.evening_end || "20:00" };
  const steps = [
    { title: "About you", render: (s) => html`<label class="field"><span class="lbl">Full name</span><input type="text" name="name" required value="${s.full_name}"></label>
      <label class="field"><span class="lbl">Email (optional)</span><input type="email" name="email" value="${s.email}"></label>
      <label class="field"><span class="lbl">City</span><select name="city">${CITIES.map((c) => html`<option ${c === s.city ? "selected" : ""}>${c}</option>`)}</select></label>`,
      collect: (f, s, soft) => { s.full_name = f.name.value.trim(); s.email = f.email.value.trim(); s.city = f.city.value; if (!soft && s.full_name.length < 2) return "Enter your full name."; } },
    { title: "Driving licence", sub: "We check your licence before any assignment. Document photos are uploaded next and kept private.",
      render: (s) => html`<label class="field"><span class="lbl">Licence number</span><input type="text" name="lic" required minlength="6" value="${s.licence_number}" autocapitalize="characters"></label>
        <label class="field"><span class="lbl">Licence expiry date</span><input type="date" name="exp" value="${s.licence_expiry}"></label>`,
      collect: (f, s, soft) => { s.licence_number = f.lic.value.trim(); s.licence_expiry = f.exp.value; if (!soft && s.licence_number.length < 6) return "Enter your licence number."; } },
    { title: "Your vehicle", sub: "Capacity must match the passenger seats on your registration certificate or permit. An admin verifies it.",
      render: (s) => html`<div class="grid2"><label class="field"><span class="lbl">Registration number</span><input type="text" name="reg" required value="${s.reg}" placeholder="KA01AB1234" autocapitalize="characters"></label>
        <label class="field"><span class="lbl">Vehicle type</span><select name="cat">${[["auto", "Auto-rickshaw"], ["taxi", "Taxi"], ["bike", "Bike"]].map(([x, l]) => html`<option value="${x}" ${s.category === x ? "selected" : ""}>${l}</option>`)}</select></label></div>
        <div class="grid2"><label class="field"><span class="lbl">Model</span><input type="text" name="model" value="${s.model}"></label>
        <label class="field"><span class="lbl">Legal passenger capacity</span><input type="number" name="cap" min="1" max="6" required value="${s.capacity}"><span class="hint">Passenger seats only, not counting you.</span></label></div>
        <div class="grid2"><label class="field"><span class="lbl">Insurance provider</span><input type="text" name="insp" value="${s.ins_provider}"></label>
        <label class="field"><span class="lbl">Policy number</span><input type="text" name="insn" value="${s.ins_policy}"></label></div>
        <div class="grid2"><label class="field"><span class="lbl">Insurance valid until</span><input type="date" name="inse" value="${s.ins_expiry}"></label>
        <label class="field"><span class="lbl">Permit number</span><input type="text" name="permit" value="${s.permit}"></label></div>`,
      collect: (f, s, soft) => { Object.assign(s, { reg: f.reg.value.trim(), category: f.cat.value, model: f.model.value.trim(), capacity: f.cap.value, ins_provider: f.insp.value.trim(), ins_policy: f.insn.value.trim(), ins_expiry: f.inse.value, permit: f.permit.value.trim() });
        if (soft) return; if (s.reg.length < 6) return "Enter the vehicle registration number."; if (!s.capacity || +s.capacity < 1) return "Enter the legal passenger capacity."; } },
    { title: "Where and when you drive", sub: "Add the areas you serve and the windows you can take commute rides.",
      render: (s) => html`<label class="field"><span class="lbl">Service areas</span><input type="text" name="areas" required value="${s.areas.join(", ")}" placeholder="Marathahalli, Bellandur, HSR Layout"><span class="hint">Separate areas with commas. Suggestions: ${(PLACES[s.city] || []).map((p) => p[0]).join(", ")}.</span></label>
        <div><span class="lbl" style="font-weight:600;font-size:.9rem;display:block;margin-bottom:8px">Days you're available</span>${chipDays("days", s.days)}</div>
        <div class="grid2"><label class="field"><span class="lbl">Morning from</span><input type="time" name="ms" value="${s.ms}"></label><label class="field"><span class="lbl">Morning until</span><input type="time" name="me" value="${s.me}"></label></div>
        <div class="grid2"><label class="field"><span class="lbl">Evening from</span><input type="time" name="es" value="${s.es}"></label><label class="field"><span class="lbl">Evening until</span><input type="time" name="ee" value="${s.ee}"></label></div>`,
      collect: (f, s, soft) => { s.areas = f.areas.value.split(",").map((x) => x.trim()).filter(Boolean); s.days = $$("input[name=days]:checked", f).map((c) => +c.value); Object.assign(s, { ms: f.ms.value, me: f.me.value, es: f.es.value, ee: f.ee.value });
        if (soft) return; if (!s.areas.length) return "Add at least one service area."; if (!s.days.length) return "Choose the days you're available."; } },
  ];
  wizard(root, { title: "Register as a driver", intro: "Tell us about you and your vehicle. You can start receiving assignments once an admin approves your documents.", steps, state: s, edit,
    submit: async (s) => {
      await api("/driver/onboarding", { method: "PUT", body: { full_name: s.full_name, email: s.email || null, city: s.city, licence_number: s.licence_number, licence_expiry: s.licence_expiry || null,
        vehicle: { registration_number: s.reg, category: s.category, model: s.model || null, permitted_passenger_capacity: +s.capacity, insurance_provider: s.ins_provider || null, insurance_policy_number: s.ins_policy || null, insurance_expiry: s.ins_expiry || null, permit_number: s.permit || null },
        service_areas: s.areas, available_days: s.days, morning_start: s.ms || null, morning_end: s.me || null, evening_start: s.es || null, evening_end: s.ee || null } });
      const u = await api("/auth/me"); session.setUser(u); onDone(u);
    } });
}

export function onboarding(root, me, config, onDone) {
  const edit = new URLSearchParams(location.search).get("edit") === "1";
  (me.role === "driver" ? driverFlow : commuterFlow)(root, me, config, onDone, edit);
}
