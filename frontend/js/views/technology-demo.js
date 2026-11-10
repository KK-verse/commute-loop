import { api } from "../api.js";
import { esc, fmtTime, icon, inr, logoMark, raw } from "../ui.js";

const E = (value) => esc(value == null ? "" : String(value));
const daysText = (days) => days.length === 5 && days.every((d, i) => d === i) ? "Monday to Friday" : days.map((d) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d]).join(", ");
const minuteText = (value) => `${value < 0 ? "−" : ""}${Math.abs(value)} min`;
const btn = (action, label, cls = "", extra = "") => `<button type="button" class="btn ${cls}" data-demo-action="${E(action)}" ${extra}>${label}</button>`;
const stat = (value, label, sub = "") => `<div class="stat"><div class="v">${E(value)}</div><div class="l">${E(label)}</div>${sub ? `<div class="s">${E(sub)}</div>` : ""}</div>`;
const badge = (label, tone = "") => `<span class="badge ${E(tone)}">${E(label)}</span>`;
const table = (heads, rows) => `<div class="table-wrap"><table><thead><tr>${heads.map((x) => `<th>${E(x)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>`;
const defaultWeights = (scenario) => Object.fromEntries(scenario.matching_weights.map((weight) => [weight.key, Number(weight.weight_percent)]));

function scenarioCard(scenario, selected) {
  const people = scenario.passengers;
  const isSelected = selected === scenario.id;
  return `<article class="card demo-scenario-card ${isSelected ? "selected" : ""}">
    <div class="row spread wrap"><div><span class="small muted">${E(scenario.id === "auto" ? "SCENARIO A" : "SCENARIO B")}</span><h2>${E(scenario.vehicle_label)} · ${people.length} commuters</h2></div>${badge("DEMO INPUTS", "orange")}</div>
    <p class="muted">${E(scenario.subtitle)}</p>
    <div class="demo-scenario-facts"><span>${icon("pin").s}${E(scenario.driver.start_label)} driver start</span><span>${icon("building").s}${E(scenario.destination.label)}</span><span>${icon("seat").s}${people.length}/${scenario.driver.legal_capacity} legal seats</span></div>
    <div class="row wrap"><button type="button" class="btn ${isSelected ? "navy" : "ghost"}" data-demo-action="run" data-scenario-id="${E(scenario.id)}">${isSelected ? "Run Demonstration" : "Select & run"}</button><button type="button" class="link" data-demo-action="select" data-scenario-id="${E(scenario.id)}">View scenario</button></div>
  </article>`;
}

function passengerTable(passengers) {
  return table(["Demo commuter", "From → office", "Preferred departure", "Arrival deadline", "Vehicle", "Max detour", "Travel days"],
    passengers.map((p) => `<tr><td><strong>${E(p.name)}</strong> ${badge("DEMO", "orange")}</td><td>${E(p.origin_label)} → ${E(p.destination_label)}</td><td>${E(fmtTime(p.preferred_departure))}</td><td>${E(fmtTime(p.arrival_deadline))}</td><td>${E(p.preferred_vehicle)}</td><td>${E(p.max_detour_minutes)} min</td><td>${E(daysText(p.travel_days))}</td></tr>`).join(""));
}

function weightPanel(state, scenario) {
  const items = scenario.matching_weights;
  const total = Object.values(state.weights).reduce((sum, value) => sum + Number(value || 0), 0);
  const valid = Math.abs(total - 100) < 0.01;
  const totalLabel = valid ? `Total ${E(total)}% · ready to score` : `Weights must add up to 100% (current ${E(total)}%).`;
  return `<details class="card demo-weight-config"><summary>Configure matching score weights</summary><p class="small muted">Adjust the scenario weights before running. The backend accepts only five complete weights totaling 100%.</p><div class="demo-weight-grid">${items.map((weight) => `<label><span>${E(weight.label)}</span><span><input type="number" min="0" max="100" step="1" value="${E(state.weights[weight.key])}" data-weight-key="${E(weight.key)}" aria-label="${E(weight.label)} weight"><b>%</b></span></label>`).join("")}</div><p class="demo-weight-total ${valid ? "valid" : "invalid"}" data-weight-total>${totalLabel}</p></details>`;
}

function mapSvg(scenario, result, view) {
  const map = result?.map || scenario.map;
  const nodes = map.nodes || [];
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));
  const graphEdges = scenario.map.edges || [];
  const paths = result?.map?.routes || {};
  const colors = ["#2e9e63", "#e8762b", "#3e6dba", "#9054a8"];
  const routeLists = view === "shared" ? [["shared", paths.shared || [], "#2e9e63"]] : Object.entries(paths.individual || {}).map(([id, path], i) => [id, path, colors[i % colors.length]]);
  const polyline = (ids, color, width, dash = "") => {
    const coords = ids.map((id) => byId[id]).filter(Boolean).map((n) => `${n.x},${n.y}`).join(" ");
    return coords ? `<polyline points="${E(coords)}" fill="none" stroke="${E(color)}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" ${dash ? `stroke-dasharray="${E(dash)}"` : ""}/>` : "";
  };
  const roads = graphEdges.map((edge) => {
    const a = byId[edge.from], b = byId[edge.to];
    return a && b ? `<line x1="${E(a.x)}" y1="${E(a.y)}" x2="${E(b.x)}" y2="${E(b.y)}" stroke="#cfd9d3" stroke-width="4" stroke-linecap="round"/>` : "";
  }).join("");
  const lines = routeLists.map((route) => polyline(route[1], route[2], view === "shared" ? 8 : 5, view === "shared" ? "" : "9 7")).join("");
  const order = Object.fromEntries((result?.route?.stops || []).filter((stop) => stop.type === "pickup").map((stop) => [stop.node, stop.pickup_order]));
  const passengerNodes = scenario.passengers.map((p) => p.origin);
  const markers = [...new Set(passengerNodes)].map((id, index) => {
    const n = byId[id];
    if (!n) return "";
    const number = order[id] || index + 1;
    const offsetX = id === scenario.driver.start ? -15 : 0;
    return `<g><circle cx="${E(n.x + offsetX)}" cy="${E(n.y)}" r="14" fill="#fff" stroke="#2e9e63" stroke-width="5"/><text x="${E(n.x + offsetX)}" y="${E(n.y + 5)}" text-anchor="middle" font-size="14" font-weight="800" fill="#16243f">${E(number)}</text><text x="${E(n.x + 19)}" y="${E(n.y - 12)}" font-size="13" font-weight="700" fill="#16243f" paint-order="stroke" stroke="#f6f8fb" stroke-width="4">${E(n.label)}</text></g>`;
  }).join("");
  const office = byId[scenario.destination.node];
  const officeMarker = office ? `<g><rect x="${E(office.x - 10)}" y="${E(office.y - 10)}" width="20" height="20" rx="5" fill="#16243f"/><text x="${E(office.x - 15)}" y="${E(office.y - 18)}" text-anchor="end" font-size="13" font-weight="700" fill="#16243f" paint-order="stroke" stroke="#f6f8fb" stroke-width="4">Office</text></g>` : "";
  const driver = byId[scenario.driver.start];
  const driverMarker = driver ? `<g><circle cx="${E(driver.x)}" cy="${E(driver.y)}" r="21" fill="none" stroke="#e8762b" stroke-width="3" stroke-dasharray="4 4"/><text x="${E(driver.x + 14)}" y="${E(driver.y + 28)}" font-size="12" font-weight="700" fill="#7a3a0a" paint-order="stroke" stroke="#fff" stroke-width="4">Driver start</text></g>` : "";
  const failure = result?.failure_test?.candidate;
  const failureNode = failure ? byId[failure.origin] : null;
  const failureMarker = failureNode ? `<g><circle cx="${E(failureNode.x)}" cy="${E(failureNode.y)}" r="13" fill="#c4372f"/><text x="${E(failureNode.x + 16)}" y="${E(failureNode.y + 5)}" font-size="13" font-weight="700" fill="#8d2620" paint-order="stroke" stroke="#fff" stroke-width="4">Rejected · Whitefield</text></g>` : "";
  return `<div class="demo-map-wrap"><div class="demo-map-cap"><strong>${E(view === "shared" ? "Optimized shared route" : "Individual direct routes")}</strong>${badge("SIMULATED ROAD GRAPH", "orange")}</div>
    <svg class="demo-map" viewBox="0 0 640 410" role="img" aria-label="${E(view === "shared" ? "Simulated optimized shared route with numbered pickups" : "Simulated individual road paths")}">
      <defs><pattern id="demo-grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="#e8eee9" stroke-width="1"/></pattern></defs><rect width="640" height="410" fill="url(#demo-grid)"/>
      ${roads}${lines}${markers}${officeMarker}${driverMarker}${failureMarker}
    </svg><div class="demo-map-legend"><span><i class="legend-road"></i> Simulated road graph</span><span><i class="legend-route"></i> ${E(view === "shared" ? "Engine-selected path" : "Individual paths")}</span><span>Numbers show pickup order.</span></div>
    <p class="small muted">${E(map.label || scenario.map.label)}. The drawing follows backend graph edges; its lines are schematic and are not road-distance measurements.</p></div>`;
}

function workflowDetail(index, stage, result, scenario) {
  const d = stage.details || {};
  if (index === 0) return passengerTable(scenario.passengers);
  if (index === 1) return `<p>${E(d.using)}</p><p>Same submitted destination: <strong>${d.same_destination ? "yes" : "no"}</strong>. Same corridor/direction: <strong>${d.same_general_direction ? "yes" : "no"}</strong>. Largest pickup separation: <strong>${E(d.maximum_pickup_road_km)} road km</strong> (limit ${E(d.road_limit_km)}).</p>${table(["Road comparison", "Distance", "Status"], (d.pairs || []).map((p) => `<tr><td>${E(p.from)} ↔ ${E(p.to)}</td><td>${E(p.road_km ?? "No path")} ${p.road_km == null ? "" : "km"}</td><td>${badge(p.compatible ? "Passed" : "Rejected", p.compatible ? "green" : "red")}</td></tr>`).join(""))}`;
  if (index === 2) return `<p>${E(d.using)}</p><p>Requested window: <strong>${E(fmtTime(d.preferred_window?.earliest))}–${E(fmtTime(d.preferred_window?.latest))}</strong> (${E(d.preferred_window?.spread_minutes)} min spread; configured limit ${E(d.spread_limit_minutes)} min). Shared days: <strong>${E((d.common_travel_days || []).map((day) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][day]).join(", "))}</strong>. Earliest deadline: ${E(fmtTime(d.arrival_deadline))}.</p>`;
  if (index === 3) return `<p>${E(d.using)}</p><p>Shared-segment passenger time: <strong>${E(d.common_passenger_road_minutes)} / ${E(d.total_individual_road_minutes)} minutes</strong> = <strong>${E(d.overlap_percent)}%</strong>. Direction agreement: ${E(d.direction_percent)}%.</p>${(d.common_segments || []).length ? table(["Common simulated road segment", "Minutes", "Used by"], d.common_segments.map((s) => `<tr><td>${E(s.label)}</td><td>${E(s.minutes)} min</td><td>${E(s.used_by.join(", "))}</td></tr>`).join("")) : `<p>No common graph segments were found.</p>`}`;
  if (index === 4) return `<p>Passengers requested: <strong>${E(d.passengers)}</strong>; configured seats: <strong>${E(d.configured_capacity)}</strong>; legal ceiling: <strong>${E(d.legal_capacity)}</strong>; effective capacity is the lower value: <strong>${E(d.effective_capacity)}</strong>.</p><p>Driver verified: <strong>${d.verified_driver ? "yes" : "no"}</strong>. Driver covers all shared travel days: <strong>${d.common_days_covered ? "yes" : "no"}</strong>.</p>`;
  if (index === 5) {
    const route = d.route;
    if (!route) return `<p>No route was selected. The optimizer will not force a grouping that fails hard constraints.</p>`;
    const rows = route.stops.map((stop) => `<tr><td>${stop.type === "pickup" ? `Pickup ${E(stop.pickup_order)}` : "Office drop-off"}</td><td>${E(stop.label)}</td><td>${E(fmtTime(stop.time))}</td>${stop.type === "pickup" ? `<td>${E(minuteText(stop.offset_minutes))} from preferred</td>` : "<td>–</td>"}</tr>`).join("");
    return `<p>Insertion search evaluated <strong>${E(d.insertion_candidates_evaluated)}</strong> complete stop orders and retained <strong>${E(d.valid_candidate_count)}</strong> valid order(s). Objective: ${E(d.objective)}.</p><p>Driver departs ${E(fmtTime(route.driver_departure))} from ${E(d.driver_start)}. Selected route: <strong>${E(route.order.map((id) => scenario.passengers.find((p) => p.id === id)?.name).join(" → "))}</strong>.</p>${table(["Stop", "Location", "Time", "Departure compatibility"], rows)}`;
  }
  if (index === 6) {
    if (!d.riders?.length) return `<p>No optimized route was available to evaluate detours.</p>`;
    return `<p>Shared journey duration is measured from each rider's scheduled pickup to office arrival, including later pickup dwell time. Additional time = that duration − the rider's shortest individual road-route duration. Time saved is the inverse comparison; negative means extra shared travel.</p>${table(["Commuter", "Direct road", "Shared from pickup", "Additional time", "Time saved vs direct", "Limit", "Pickup → office"], d.riders.map((r) => {
      const passenger = scenario.passengers.find((p) => p.id === r.passenger_id);
      return `<tr><td>${E(passenger?.name)}</td><td>${E(r.direct_distance_km)} km · ${E(r.direct_minutes)} min</td><td>${E(r.passenger_distance_km)} km · ${E(r.shared_minutes)} min</td><td>${E(minuteText(r.additional_minutes))}</td><td>${E(minuteText(r.time_saved_minutes))}</td><td>${E(passenger?.max_detour_minutes)} min</td><td>${E(fmtTime(r.pickup_time))} → ${E(fmtTime(r.arrival_time))}</td></tr>`;
    }).join(""))}<p>Office arrival ${E(fmtTime(d.office_arrival))}; required by ${E(fmtTime(d.deadline))}.</p>`;
  }
  if (index === 7) return result.score ? `${table(["Score component", "Raw", "Weight", "Weighted points"], result.score.components.map((c) => `<tr><td>${E(c.label)}</td><td>${E(c.score)} / 100</td><td>${E(c.weight_percent)}%</td><td>${E(c.weighted_points)}</td></tr>`).join(""))}<p>Formula: ${E(result.score.formula)} Hard constraints gate scoring: yes.</p>` : `<p>Score withheld because the group failed a hard constraint. A high score cannot override capacity, timing or route rejection.</p>`;
  return `<p>${E(result.result_message)} All fixture profiles and outputs are labelled DEMO. No live user or commute records were read or written.</p>`;
}

function routeSummary(result, scenario) {
  const route = result.route;
  if (!route) return `<div class="notice red">No valid shared route passed the hard constraints.</div>`;
  const list = route.stops.map((stop) => `<li><span class="demo-route-number ${stop.type === "dropoff" ? "office" : ""}">${stop.type === "pickup" ? E(stop.pickup_order) : icon("building").s}</span><div><strong>${E(stop.type === "pickup" ? `Pickup ${stop.pickup_order}: ${stop.label}` : `Drop-off: ${stop.label}`)}</strong><small>${stop.type === "pickup" ? E(scenario.passengers.find((p) => p.id === stop.passenger_id)?.name || "DEMO commuter") : "Shared destination"}</small></div><time>${E(fmtTime(stop.time))}</time></li>`).join("");
  return `<div class="demo-route-head"><div><span class="small muted">${E(scenario.driver.vehicle)} · VERIFIED DEMO DRIVER</span><h3>${E(scenario.driver.start_label)} → ${E(scenario.destination.label)}</h3></div>${badge(`${route.shared_minutes} min shared`, "green")}</div><ol class="demo-route-list"><li><span class="demo-route-number start">D</span><div><strong>Driver departs</strong><small>${E(scenario.driver.start_label)} · available from ${E(fmtTime(scenario.driver.available_from))}</small></div><time>${E(fmtTime(route.driver_departure))}</time></li>${list}</ol><div class="notice green">${E(result.result_message)} Arrives ${E(fmtTime(route.office_arrival))}, before the ${E(fmtTime(route.deadline))} deadline.</div>`;
}

function fareTable(result) {
  if (!result.fares) return `<p class="muted">Fare calculation appears only when the route passes hard constraints.</p>`;
  return `${table(["DEMO commuter", "Individual distance", "Shared passenger distance", "Shared fare", "Separate estimate", "Estimated savings"], result.fares.rows.map((row) => `<tr><td><strong>${E(row.name)}</strong></td><td>${E(row.direct_distance_km)} km</td><td>${E(row.shared_passenger_distance_km)} km</td><td>${E(inr(row.shared_fare))}</td><td>${E(inr(row.estimated_direct_fare))}</td><td>${E(inr(row.estimated_savings))}</td></tr>`).join(""))}<div class="row spread wrap demo-fare-total"><strong>Total illustrative shared fare</strong><strong>${E(inr(result.fares.total_shared_fare))}</strong></div><p class="small muted">${E(result.fares.tariff)}. ${E(result.fares.assumption)} Shares sum to ${E(inr(result.fares.shares_sum))}. Passenger-kilometre denominator: ${E(result.fares.total_passenger_km)} km.</p>`;
}

function failurePanel(result) {
  let incompatible = `<p class="muted">Runs an extra DEMO request from Whitefield to a different office at 10:30 AM, with a 10:00 AM arrival deadline. The engine evaluates the request against the selected group's corridor.</p>`;
  if (result?.failure_test) {
    const test = result.failure_test;
    incompatible = `<div class="notice red"><span><strong>${E(test.candidate.name)} rejected</strong> · ${E(test.candidate.origin_label)} → ${E(test.candidate.destination_label)}, preferred ${E(fmtTime(test.candidate.preferred_departure))}, deadline ${E(fmtTime(test.candidate.arrival_deadline))}.</span></div><ul class="demo-failure-list">${test.failed_constraints.map((f) => `<li><strong>${E(f.constraint)}:</strong> ${E(f.reason)}</li>`).join("")}</ul><p>${E(test.alternative_explanation)}</p>`;
  }
  let capacity = `<p class="muted">Attempts to add one more passenger after the selected vehicle is full.</p>`;
  if (result?.capacity_test) {
    const test = result.capacity_test;
    capacity = `<div class="notice red"><span><strong>${test.accepted ? "Extra passenger accepted" : "Extra passenger rejected"}</strong> · ${E(test.requested_total)} requested / ${E(test.effective_capacity)} effective seats.</span></div><p>${E(test.reason)}</p>`;
  }
  return `<div class="grid2 demo-failure-grid"><article class="card"><h3>What happens when a commuter is incompatible?</h3>${incompatible}${btn("incompatible", result?.mode === "incompatible" ? "Run again" : "Run incompatibility test", "ghost sm")}</article><article class="card"><h3>Capacity failure test</h3>${capacity}${btn("capacity", result?.mode === "capacity" ? "Run again" : "Attempt one extra passenger", "ghost sm")}</article></div>`;
}

function technicalPanel(result, scenario) {
  if (!result) return `<details class="card demo-technical"><summary>Technical Calculation & Algorithm Explanation</summary><p class="muted">Run the algorithm to reveal values calculated from the selected scenario's backend road graph and fare functions.</p></details>`;
  const riders = result.route?.rider_metrics ? Object.values(result.route.rider_metrics) : [];
  const eDetour = riders.length ? riders.map((r) => `${E(r.shared_minutes)} − ${E(r.direct_minutes)} = ${E(minuteText(r.additional_minutes))}`).join("; ") : "No selected route";
  const components = result.score?.components || [];
  const weightsUsed = scenario.matching_weights.map((weight) => `${E(weight.label)} ${E(weight.weight_percent)}%`).join(", ");
  return `<details class="card demo-technical"><summary>Technical Calculation & Algorithm Explanation</summary><div class="grid2 demo-tech-grid">
    <section><h3>A · Geographic compatibility</h3><p>${E(result.geography.using)} Largest pickup road separation is ${E(result.geography.maximum_pickup_road_km)} km against a ${E(result.geography.road_limit_km)} km demo threshold. Destinations and corridor labels are compared separately.</p></section>
    <section><h3>B · Route overlap</h3><p>${E(result.route_overlap.using)} Common segment time is ${E(result.route_overlap.common_passenger_road_minutes)} of ${E(result.route_overlap.total_individual_road_minutes)} individual-route minutes; overlap is ${E(result.route_overlap.overlap_percent)}%.</p></section>
    <section><h3>C · Time compatibility</h3><p>${E(result.time_compatibility.using)} Requested departure span ${E(result.time_compatibility.preferred_window.spread_minutes)} min; configured span limit ${E(result.time_compatibility.spread_limit_minutes)} min; actual pickups and office deadline are rechecked per insertion order.</p></section>
    <section><h3>D · Capacity validation</h3><p>Effective capacity = min(configured ${E(scenario.driver.capacity)}, legal ceiling ${E(scenario.driver.legal_capacity)}) = ${E(Math.min(scenario.driver.capacity, scenario.driver.legal_capacity))}. A hard capacity failure stops scoring.</p></section>
    <section><h3>E · Detour calculation</h3><p>Additional travel time = shared journey time from pickup to office − shortest individual road-route time. Calculated: ${eDetour}. Baseline uses the same simulated road graph and fastest-path rule as the group legs.</p></section>
    <section><h3>F · Matching score</h3><p>${E(result.score?.formula || "No score: hard constraint failed.")} Five raw component scores and weighted points are shown above. Weights used for this run: ${weightsUsed}.</p></section>
    <section><h3>G · Route optimization</h3><p>The backend inserts each pickup into every position of the partial route, then evaluates the complete driver-start → pickups → office path. It minimizes simulated driving-plus-stop minutes, then distance and pickup offset. It evaluated ${E(result.stages[5].details.insertion_candidates_evaluated)} candidate orders; the selected order is ${E(result.route?.order.join(" → ") || "none")}.</p></section>
    <section><h3>H · Fare distribution</h3><p>${E(result.fares?.formula || "Fare unavailable because the route was rejected.")} Shared passenger distances sum to ${E(result.fares?.total_passenger_km ?? "–")} passenger-km and allocate ${E(inr(result.fares?.total_shared_fare))} by distance. ${E(result.fares?.tariff || "")}. All fares are illustrative, not live quotes.</p></section>
  </div><p class="small muted">All graph edges, times, and fare assumptions in this module are deterministic DEMO inputs. No live road-routing adapter is connected and no operational records are changed.</p></details>`;
}

function weeklyStrip(result) {
  return `<section class="card demo-week-card"><div class="row spread wrap"><div><h3>Recurring commute · Monday to Friday</h3><p class="small muted">Five separate illustrative daily instances. Skipping Wednesday leaves the recurring plan active.</p></div>${badge("DEMO SCHEDULE", "orange")}</div><div class="demo-week">${result.recurring_week.map((day) => `<div class="day"><div class="d">${E(day.day.slice(0, 3))}</div><span class="pill ${day.status.toUpperCase()}">${E(day.status)}</span><small>${day.status === "Skipped" ? "Plan stays active" : "Separate trip instance"}</small></div>`).join("")}</div><p class="small muted">Schedule is kept in the demo fixture, not written as real trip instances.</p></section>`;
}

function workflow(scenario, result, state) {
  const names = state.data.stages;
  return `<section class="demo-workflow card" aria-labelledby="demo-workflow-title"><div class="row spread wrap"><div><span class="small muted">BACKEND MATCHING PIPELINE</span><h2 id="demo-workflow-title">The engine, step by step</h2><p class="muted">Each row is the result returned by the backend calculation for this run.</p></div>${state.running ? badge("Calculating", "orange") : result ? badge("Run complete", result.success ? "green" : "red") : badge("Ready", "")}</div>
    <div class="demo-stage-list">${names.map((name, index) => {
      const stage = result?.stages?.[index];
      const status = state.running && index === 0 ? "calculating" : stage?.status || "waiting";
      const statusLabel = status === "passed" ? "Passed" : status === "rejected" ? "Rejected" : status === "warning" ? "Warning" : status === "calculating" ? "Calculating" : "Waiting";
      const statusTone = status === "passed" ? "green" : status === "rejected" ? "red" : status === "warning" || status === "calculating" ? "orange" : "";
      const summary = stage?.summary || (status === "calculating" ? "Sending this stage to the matching service." : "Run the algorithm to evaluate this stage.");
      return `<details class="demo-stage ${state.stageIndex === index ? "current" : ""}" id="demo-stage-${index}" ${state.stageIndex === index ? "open" : ""}><summary><span class="demo-stage-num">${String(index + 1).padStart(2, "0")}</span><strong>${E(name)}</strong>${badge(statusLabel, statusTone)}</summary><p>${E(summary)}</p>${stage ? `<div class="demo-stage-detail">${workflowDetail(index, stage, result, scenario)}</div>` : ""}<button type="button" class="link" data-demo-action="stage" data-stage-index="${index}">Focus this stage</button></details>`;
    }).join("")}</div>
    ${state.presentation ? `<div class="row spread demo-stage-nav"><button type="button" class="btn ghost" data-demo-action="stage-prev" ${state.stageIndex <= 0 ? "disabled" : ""}>← Previous stage</button><span>Stage ${Math.min(state.stageIndex + 1, names.length)} of ${names.length}</span><button type="button" class="btn ghost" data-demo-action="stage-next" ${state.stageIndex >= names.length - 1 ? "disabled" : ""}>Next stage →</button></div>` : ""}
  </section>`;
}

function renderDemo(state) {
  const scenario = state.data.scenarios.find((item) => item.id === state.scenarioId) || state.data.scenarios[0];
  const result = state.result;
  const presentationHeader = state.presentation ? `<div class="demo-presentation-bar"><div class="row">${logoMark.s}<strong>Commute<span>Loop</span> · Judge Presentation</strong>${badge("DEMO ONLY", "orange")}</div><div class="row wrap"><button class="btn ghost sm" type="button" data-demo-action="select" data-scenario-id="auto">Auto scenario</button><button class="btn ghost sm" type="button" data-demo-action="select" data-scenario-id="cab">Cab scenario</button><button class="btn navy sm" type="button" data-demo-action="exit-presentation">Exit presentation</button></div></div>` : "";
  const score = result?.score;
  const success = result?.success;
  const timeImpact = result?.time_summary ? ` Individual-trip time saved is ${E(minuteText(result.time_summary.net_minutes_saved))} net across riders; negative values mean added shared travel time, not a time saving.` : "";
  const statusNotice = result ? `<div class="notice ${success ? "green" : "red"}"><span><strong>${E(result.result_message)}</strong> ${success ? `Backend score ${E(score?.total)}/100; route, capacity, timing and detour checks passed.` : "The engine rejected this group at a hard-constraint check."}${timeImpact}</span></div>` : `<div class="notice"><span>Demo fixtures are isolated from real user records. Inputs, road paths and fare assumptions are labelled simulated.</span></div>`;
  const results = result ? `<section class="demo-results"><div class="demo-results-top"><div><span class="small muted">${E(scenario.title.toUpperCase())}</span><h2>Proposed shared commute</h2></div>${stat(score ? `${score.total}/100` : "Not scored", "Matching score", score ? "Hard constraints passed" : "Hard constraints gate score")}</div>
    ${statusNotice}<div class="demo-result-grid"><article class="card"><h3>Driver and optimized stop order</h3>${routeSummary(result, scenario)}</article><article class="card demo-map-card"><div class="row spread wrap"><h3>Route view</h3><div class="seg demo-map-toggle"><button type="button" data-demo-action="map" data-map-view="shared" aria-pressed="${state.mapView === "shared"}">Shared route</button><button type="button" data-demo-action="map" data-map-view="individual" aria-pressed="${state.mapView === "individual"}">Individual routes</button></div></div>${mapSvg(scenario, result, state.mapView)}</article></div>
    <article class="card"><div class="row spread wrap"><div><h3>Direct versus shared commute</h3><p class="small muted">The shared duration starts at each commuter's pickup; direct time uses that commuter's shortest individual graph path.</p></div>${badge("SIMULATED ROUTING", "orange")}</div>${result.route ? table(["Commuter", "Direct route", "Shared passenger leg", "Pickup → arrival", "Added time", "Time saved vs direct", "Detour limit"], scenario.passengers.map((p) => { const r = result.route.rider_metrics[p.id]; return `<tr><td>${E(p.name)}</td><td>${E(r.direct_distance_km)} km · ${E(r.direct_minutes)} min</td><td>${E(r.passenger_distance_km)} km · ${E(r.shared_minutes)} min</td><td>${E(fmtTime(r.pickup_time))} → ${E(fmtTime(r.arrival_time))}</td><td>${E(minuteText(r.additional_minutes))}</td><td>${E(minuteText(r.time_saved_minutes))}</td><td>${E(p.max_detour_minutes)} min ${badge(r.additional_minutes <= p.max_detour_minutes ? "Passed" : "Rejected", r.additional_minutes <= p.max_detour_minutes ? "green" : "red")}</td></tr>`; }).join("")) : ""}</article>
    <article class="card"><div class="row spread wrap"><div><h3>Distance-proportional fare split</h3><p class="small muted">Passenger fare = (individual passenger distance ÷ total passenger-distance) × shared fare.</p></div>${badge("ILLUSTRATIVE FARES", "orange")}</div>${fareTable(result)}</article>
    ${weeklyStrip(result)}${failurePanel(result)}${technicalPanel(result, scenario)}</section>` : `<section class="demo-empty"><div>${icon("route").s}</div><span class="small muted">READY WHEN YOU ARE</span><h2>Run the scenario to see the matching engine work</h2><p>Select a scenario above, then run it. The backend will calculate candidate pickup insertions, constraints, score and fare split.</p>${btn("run", "Run Matching Algorithm", "navy")}</section>`;
  const stageNav = state.presentation && result ? `<div class="demo-presentation-note">Use Previous/Next below the workflow to walk through the nine backend stages. Choose a scenario at the top to switch vehicle and route.</div>` : "";
  return raw(`<div class="tech-demo-page ${state.presentation ? "presentation" : ""}">${presentationHeader}<header class="demo-heading"><div><span class="small muted">ADMIN · INNOVATION CHALLENGE</span><h1>Technology Demonstration</h1><p>${E(state.data.introduction)}</p></div><div class="row wrap">${btn("present", state.presentation ? "Presentation mode on" : "Start Judge Presentation", state.presentation ? "navy" : "ghost")}<button class="btn ghost" type="button" data-demo-action="reset">Reset demonstration</button></div></header>
    ${state.error ? `<div class="notice red" role="alert">${E(state.error)}</div>` : ""}<div class="demo-notice">${badge("SIMULATED INPUTS", "orange")}<span>${E(state.data.routing)} No sample request is presented as live demand.</span></div>
    <section class="demo-scenarios"><div class="row spread wrap"><div><h2>Choose a scenario</h2><p class="muted">Start with a 3-rider auto, then compare how the optimizer handles a 4-rider cab.</p></div>${state.running ? badge("Backend calculation running", "orange") : ""}</div><div class="grid2">${state.data.scenarios.map((item) => scenarioCard(item, state.scenarioId)).join("")}</div></section>
    ${weightPanel(state, scenario)}
    <section class="demo-selected"><div class="row spread wrap"><div><span class="small muted">SELECTED FIXTURE</span><h2>${E(scenario.title)}</h2><p class="muted">${E(scenario.subtitle)} · driver ${E(scenario.driver.name)} verified · ${E(scenario.driver.capacity)} seats · available ${E(fmtTime(scenario.driver.available_from))} onward.</p></div><div class="row wrap">${btn("run", state.running ? "Running engine…" : "Run Matching Algorithm", "navy", state.running ? "disabled aria-busy=\"true\"" : "")}</div></div>
      ${passengerTable(scenario.passengers)}
    </section>${workflow(scenario, result, state)}${stageNav}${results}
    <footer class="demo-footer">${logoMark.s}<span>CommuteLoop · judge demonstration · all profiles, routes, timings and fares marked DEMO.</span></footer>
  </div>`);
}

export async function technologyDemo() {
  const data = await api("/admin/technology-demo/scenarios");
  const state = { data, scenarioId: "auto", result: null, mode: "standard", running: false,
    error: "", mapView: "shared", presentation: false, stageIndex: 0,
    weights: defaultWeights(data.scenarios.find((item) => item.id === "auto")) };
  return { title: "Technology Demo", html: renderDemo(state), mount: (host) => {
    const refresh = () => {
      host.innerHTML = renderDemo(state).s;
      host.closest(".shell")?.classList.toggle("demo-presenting", state.presentation);
    };
    refresh();
    host.onchange = (event) => {
      const input = event.target.closest("[data-weight-key]");
      if (!input) return;
      state.weights[input.dataset.weightKey] = Number(input.value);
      const total = Object.values(state.weights).reduce((sum, value) => sum + Number(value || 0), 0);
      const valid = Math.abs(total - 100) < 0.01;
      const totalNode = host.querySelector("[data-weight-total]");
      if (totalNode) {
        totalNode.textContent = valid ? `Total ${total}% · ready to score` : `Weights must add up to 100% (current ${total}%).`;
        totalNode.classList.toggle("valid", valid);
        totalNode.classList.toggle("invalid", !valid);
      }
    };
    host.onclick = async (event) => {
      const button = event.target.closest("[data-demo-action]");
      if (!button || state.running) return;
      const action = button.dataset.demoAction;
      if (action === "select") {
        state.scenarioId = button.dataset.scenarioId;
        state.result = null; state.error = ""; state.mode = "standard"; state.mapView = "shared"; state.stageIndex = 0;
        state.weights = defaultWeights(state.data.scenarios.find((item) => item.id === state.scenarioId));
        refresh(); return;
      }
      if (action === "reset") {
        state.scenarioId = "auto"; state.result = null; state.error = ""; state.mode = "standard";
        state.mapView = "shared"; state.presentation = false; state.stageIndex = 0;
        state.weights = defaultWeights(state.data.scenarios.find((item) => item.id === "auto"));
        refresh(); return;
      }
      if (action === "present") { state.presentation = true; refresh(); return; }
      if (action === "exit-presentation") { state.presentation = false; refresh(); return; }
      if (action === "map") { state.mapView = button.dataset.mapView; refresh(); return; }
      if (action === "stage") { state.stageIndex = Number(button.dataset.stageIndex); refresh(); return; }
      if (action === "stage-prev" || action === "stage-next") {
        state.stageIndex = Math.max(0, Math.min(state.data.stages.length - 1, state.stageIndex + (action === "stage-next" ? 1 : -1)));
        refresh(); host.querySelector(`#demo-stage-${state.stageIndex}`)?.scrollIntoView({ block: "center", behavior: "smooth" }); return;
      }
      const runMode = action === "incompatible" ? "incompatible" : action === "capacity" ? "capacity" : "standard";
      if (button.dataset.scenarioId && button.dataset.scenarioId !== state.scenarioId) {
        state.scenarioId = button.dataset.scenarioId;
        state.result = null;
        state.weights = defaultWeights(state.data.scenarios.find((item) => item.id === state.scenarioId));
      }
      state.mode = runMode; state.running = true; state.error = ""; state.stageIndex = 0;
      refresh();
      try {
        state.result = await api("/admin/technology-demo/run", { method: "POST", body: { scenario_id: state.scenarioId, mode: runMode, weights: state.weights } });
        state.mapView = "shared";
      } catch (error) {
        state.error = error.message || "The demonstration calculation could not complete.";
      } finally {
        state.running = false;
        refresh();
      }
    };
  } };
}
