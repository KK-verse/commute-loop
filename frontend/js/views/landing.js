import { html, icon, logo, raw } from "../ui.js";

const cityFallback = raw(`
<svg class="lp-city-fallback" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
  <defs>
    <radialGradient id="cityGlow" cx="70%" cy="48%" r="60%"><stop stop-color="#0e5b6a" stop-opacity=".52"/><stop offset="1" stop-color="#07111e" stop-opacity="0"/></radialGradient>
    <linearGradient id="roadGlow" x2="0" y2="1"><stop stop-color="#4de4d1" stop-opacity=".95"/><stop offset="1" stop-color="#21aab5" stop-opacity=".15"/></linearGradient>
    <linearGradient id="building" x2="1" y2="1"><stop stop-color="#173649"/><stop offset="1" stop-color="#0a1b29"/></linearGradient>
    <pattern id="windows" width="24" height="30" patternUnits="userSpaceOnUse"><rect x="5" y="5" width="5" height="8" rx="1" fill="#54d9cd" opacity=".42"/><rect x="15" y="17" width="4" height="7" rx="1" fill="#f8b46c" opacity=".26"/></pattern>
  </defs>
  <rect width="1600" height="900" fill="#07111e"/><rect width="1600" height="900" fill="url(#cityGlow)"/>
  <g opacity=".68" fill="url(#building)" stroke="#244458" stroke-width="2">
    <path d="M0 275 90 235 190 275 190 540 0 600Z"/><path d="M80 190 225 145 350 205 350 510 80 590Z"/><path d="M315 280 400 246 512 282 512 530 315 582Z"/>
    <path d="M512 155 625 111 752 158 752 472 512 537Z"/><path d="M700 228 792 190 891 228 891 466 700 516Z"/><path d="M960 120 1084 77 1210 123 1210 449 960 505Z"/>
    <path d="M1180 248 1274 209 1376 250 1376 493 1180 544Z"/><path d="M1370 163 1480 123 1600 168 1600 470 1370 526Z"/>
  </g>
  <g fill="url(#windows)" opacity=".8">
    <path d="M0 275 90 235 190 275 190 540 0 600Z"/><path d="M80 190 225 145 350 205 350 510 80 590Z"/><path d="M315 280 400 246 512 282 512 530 315 582Z"/>
    <path d="M512 155 625 111 752 158 752 472 512 537Z"/><path d="M700 228 792 190 891 228 891 466 700 516Z"/><path d="M960 120 1084 77 1210 123 1210 449 960 505Z"/>
    <path d="M1180 248 1274 209 1376 250 1376 493 1180 544Z"/><path d="M1370 163 1480 123 1600 168 1600 470 1370 526Z"/>
  </g>
  <g fill="none" stroke="#254c5d" stroke-width="3" opacity=".56">
    <path d="M-70 690 410 550 880 435 1630 277"/><path d="M-50 750 425 604 920 480 1640 328"/><path d="M-20 814 448 663 955 532 1640 386"/>
    <path d="M320 900 560 574 705 300"/><path d="M680 900 812 548 930 250"/><path d="M1080 900 1090 542 1145 240"/><path d="M1420 900 1340 558 1320 230"/>
  </g>
  <path d="M-28 778 410 640 690 558 690 477 925 420 925 347 1190 281 1490 221" fill="none" stroke="#28cfc2" stroke-width="15" opacity=".13" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M-28 778 410 640 690 558 690 477 925 420 925 347 1190 281 1490 221" fill="none" stroke="url(#roadGlow)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <g fill="#07111e" stroke="#68f0df" stroke-width="4"><circle cx="410" cy="640" r="9"/><circle cx="690" cy="477" r="9"/><circle cx="925" cy="347" r="9"/><circle cx="1490" cy="221" r="12"/></g>
  <g fill="#52e2d1" opacity=".82"><circle cx="475" cy="618" r="2"/><circle cx="530" cy="600" r="2"/><circle cx="1030" cy="322" r="2"/><circle cx="1280" cy="261" r="2"/></g>
</svg>`);

const check = icon("check");
const weights = [
  ["Time compatibility", 30], ["Route overlap & direction", 30], ["Detour", 20],
  ["Pickup / drop convenience", 10], ["Recurring schedule", 10],
];

export function landing(user, config = {}) {
  const appHref = user ? (user.role === "driver" ? "/driver" : user.role === "admin" ? "/admin" : "/app/book") : "/register";
  const appLabel = user?.role === "commuter" || !user ? "Book a commute" : "Open your app";
  const demoHref = user?.role === "admin" ? "/admin/technology-demo" : "#technology";
  const demoLabel = user?.role === "admin" ? "Open technology demo" : "Explore the matching logic";
  const mapStatus = config.maps?.live
    ? `Map provider configured: ${config.maps.provider}. This page does not request live routes.`
    : "Google Maps and live routing are not configured in this local build.";
  const mapNote = config.maps?.live
    ? "Live road geometry is not drawn here yet. Route previews stay out of the marketing page until the map client is connected."
    : "This build has no Maps API key. We do not draw made-up roads or present illustrative travel times as live guidance.";

  return html`
  <div class="lp-site" id="main" data-experience="3d">
    <header class="lp-hero">
      <div class="lp-scene" aria-hidden="true">
        <canvas class="lp-city-canvas" data-city-scene></canvas>
        ${cityFallback}
        <div class="lp-scene-shade"></div>
      </div>
      <div class="lp-topbar-wrap">
        <div class="lp-topbar">
          ${logo()}
          <nav class="lp-links" aria-label="Main navigation">
            <a href="/" aria-current="page">Home</a><a href="#how">How it works</a><a href="#technology">Technology</a>
            <a href="#commuters">Commuters</a><a href="#drivers">Drivers</a>
          </nav>
          <div class="lp-actions">
            <button class="lp-view-toggle" type="button" data-view-toggle aria-pressed="true" aria-label="Switch to Classic View"><span class="lp-toggle-icon">◈</span><span data-view-label>3D view</span></button>
            ${user ? html`<a class="btn sm lp-nav-cta" href="${appHref}" data-link>Open your app</a>` : html`<a class="lp-login" href="/login" data-link>Log in</a><a class="btn sm lp-nav-cta" href="/register" data-link>Get started</a>`}
          </div>
        </div>
      </div>

      <div class="lp-hero-inner">
        <div class="lp-copy">
          <p class="lp-eyebrow"><span></span>The future of everyday commuting</p>
          <h1>Your daily commute.<br><em>Reimagined.</em></h1>
          <p class="lp-lede">Why travel alone when your everyday route could connect you with others? CommuteLoop intelligently coordinates recurring office journeys through route compatibility, timing and shared mobility.</p>
          <div class="lp-hero-actions">
            <a class="lp-button lp-button-primary" href="${appHref}" data-link>${appLabel}<span aria-hidden="true">↗</span></a>
            <a class="lp-button lp-button-secondary" href="#how">Explore how it works<span aria-hidden="true">↓</span></a>
          </div>
          <div class="lp-trustline"><span class="lp-trust-mark">${icon("check")}</span><span>Built around real schedules, real capacity limits and recurring trips.</span></div>
        </div>

        <aside class="lp-route-card" aria-label="Illustrative shared commute concept">
          <div class="lp-card-top"><div><span class="lp-card-kicker">BENGALURU · CONCEPT VIEW</span><h2>Three journeys,<br>one shared direction.</h2></div><span class="lp-card-mark" aria-hidden="true">↗</span></div>
          <div class="lp-route-visual" aria-hidden="true"><span class="lp-route-line"></span><span class="lp-route-point lp-point-a"></span><span class="lp-route-point lp-point-b"></span><span class="lp-route-point lp-point-c"></span><span class="lp-route-point lp-point-d"></span><span class="lp-route-car">CL</span></div>
          <div class="lp-route-labels"><span>Marathahalli</span><span>Kadubeesanahalli</span><span>Panathur</span><span>Bellandur</span></div>
          <div class="lp-route-foot"><span><i></i> Shared commute concept</span><span class="lp-sim-pill">ILLUSTRATIVE</span></div>
          <p class="lp-card-caption">City artwork is atmospheric. This is not a live map or a navigation route.</p>
        </aside>
      </div>

      <a class="lp-scroll" href="#how"><span class="lp-scroll-wheel"></span><span>Scroll to explore</span></a>
      <div class="lp-hero-index" aria-hidden="true"><span>01</span><i></i><span>05</span></div>
    </header>

    <section class="lp-signal-strip" aria-label="Commute coordination checks">
      <div class="lp-signal-inner"><span class="lp-signal-label">A better commute starts with</span><span>Compatible destinations</span><i></i><span>Shared route direction</span><i></i><span>Arrival deadlines</span><i></i><span>Legal seat capacity</span></div>
    </section>

    <section class="lp-section lp-how" id="how" aria-labelledby="lp-how-title">
      <div class="lp-section-head"><div><p class="lp-overline">A ROUTINE, COORDINATED</p><h2 id="lp-how-title">Not another ride listing.<br><em>A commute system.</em></h2></div><p>CommuteLoop plans around the journey you make again and again—then keeps every travel day visible and manageable.</p></div>
      <div class="lp-steps">
        <article><span class="lp-step-number">01</span><h3>Enter your commute</h3><p>Add your pickup, office, departure time, arrival deadline and the days you travel.</p></article>
        <article><span class="lp-step-number">02</span><h3>Find compatible people</h3><p>Compare office destinations, direction, travel days and the time window that works for everyone.</p></article>
        <article><span class="lp-step-number">03</span><h3>Check the shared route</h3><p>Evaluate pickup order, driving time and each passenger’s allowed detour before proposing a group.</p></article>
        <article><span class="lp-step-number">04</span><h3>Confirm with a driver</h3><p>Match only with a verified driver and an eligible vehicle with enough legal seats.</p></article>
        <article><span class="lp-step-number">05</span><h3>Repeat on your days</h3><p>See a separate trip for each day, accept or skip an instance, and keep the rest of the plan active.</p></article>
      </div>
    </section>

    <section class="lp-tech-section" id="technology" aria-labelledby="lp-tech-title">
      <div class="lp-tech-orbit" aria-hidden="true"><span></span><span></span><span></span><b>CL</b></div>
      <div class="lp-tech-copy"><p class="lp-overline">THE INTELLIGENCE BEHIND THE JOURNEY</p><h2 id="lp-tech-title">A score with<br><em>hard limits.</em></h2><p>The compatibility score ranks candidates only after feasibility checks. A high score cannot override a missed deadline, an unacceptable detour or a full vehicle.</p><div class="lp-tech-gates"><span><i>✓</i> Vehicle capacity</span><span><i>✓</i> Arrival deadline</span><span><i>✓</i> Detour limits</span></div><a class="lp-button lp-button-light" href="${demoHref}" ${user?.role === "admin" ? 'data-link' : ""}>${demoLabel}<span aria-hidden="true">↗</span></a></div>
      <div class="lp-weights" aria-label="Illustrative initial matching weights">${weights.map(([label, weight], index) => html`<div class="lp-weight-row"><div class="lp-weight-name"><span>${String(index + 1).padStart(2, "0")} &nbsp; ${label}</span><strong>${weight}%</strong></div><div class="lp-weight-track"><span style="--weight:${weight}%"></span></div></div>`)}</div>
      <p class="lp-tech-caption">Initial proposed weights shown. Admins can adjust weights in the isolated judge demonstration.</p>
    </section>

    <section class="lp-section lp-map-section" id="routes" aria-labelledby="lp-map-title">
      <div class="lp-map-card">
        <div class="lp-map-copy"><p class="lp-overline">BUILT FOR BENGALURU. READY TO EXPAND.</p><h2 id="lp-map-title">Real roads deserve<br><em>real routing data.</em></h2><p>${mapNote}</p><a class="lp-text-link" href="${user?.role === "admin" ? "/admin/technology-demo" : "/login"}" ${user?.role === "admin" ? 'data-link' : 'data-link'}>${user?.role === "admin" ? "Open the simulated judge demo" : "Sign in to explore the platform"}<span aria-hidden="true">↗</span></a></div>
        <div class="lp-map-status-card"><div class="lp-map-status-head"><span class="lp-map-status-dot"></span><span>${mapStatus}</span></div><div class="lp-map-grid" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span><span></span><b>MAP</b></div><p>Route geometry and travel times are intentionally omitted until a live routing provider is connected.</p></div>
      </div>
    </section>

    <section class="lp-section lp-people-section" aria-label="For commuters and drivers">
      <div class="lp-section-head"><div><p class="lp-overline">MADE FOR EVERY SIDE OF THE RIDE</p><h2>Your daily route,<br><em>better coordinated.</em></h2></div><p>Commuters keep control of their schedule. Drivers see eligible recurring demand and clear pickup details.</p></div>
      <div class="lp-people-grid">
        <article class="lp-person-card lp-rider-card" id="commuters"><div class="lp-person-icon">01</div><p class="lp-overline">FOR COMMUTERS</p><h3>Keep your routine.<br>Share the road.</h3><ul><li>${check}<span>Set your office journey and travel days once.</span></li><li>${check}<span>Review your pickup, detour and fare share before accepting.</span></li><li>${check}<span>Skip one trip without cancelling the rest of your plan.</span></li></ul><a class="lp-text-link" href="${user?.role === "commuter" ? "/app" : "/register"}" data-link>${user?.role === "commuter" ? "Open commuter app" : "Start as a commuter"}<span aria-hidden="true">↗</span></a></article>
        <article class="lp-person-card lp-driver-card" id="drivers"><div class="lp-person-icon">02</div><p class="lp-overline">FOR DRIVERS</p><h3>Plan around<br>recurring demand.</h3><ul><li>${check}<span>See passenger order and upcoming assignments in advance.</span></li><li>${check}<span>Only verified drivers receive eligible trip assignments.</span></li><li>${check}<span>Vehicle capacity is checked against legal seat limits.</span></li></ul><a class="lp-text-link" href="${user?.role === "driver" ? "/driver" : "/register"}" data-link>${user?.role === "driver" ? "Open driver app" : "Join as a driver"}<span aria-hidden="true">↗</span></a></article>
      </div>
    </section>

    <section class="lp-repeat-section" id="recurring" aria-labelledby="lp-repeat-title">
      <div class="lp-repeat-copy"><p class="lp-overline">RECURRING BY DESIGN</p><h2 id="lp-repeat-title">One plan.<br><em>Every travel day.</em></h2><p>Each commute day has its own trip status. Skip a day or request a change without cancelling the full weekly plan.</p><div class="lp-week" aria-label="Illustrative weekly commute schedule"><span class="lp-day"><b>MON</b><i>Ride</i></span><span class="lp-day"><b>TUE</b><i>Ride</i></span><span class="lp-day lp-day-skip"><b>WED</b><i>Skip</i></span><span class="lp-day"><b>THU</b><i>Ride</i></span><span class="lp-day"><b>FRI</b><i>Ride</i></span></div><small>Illustrative weekly plan · each day is managed separately</small></div>
      <div class="lp-repeat-mark" aria-hidden="true"><div class="lp-repeat-ring lp-ring-one"></div><div class="lp-repeat-ring lp-ring-two"></div><div class="lp-repeat-core">${icon("calendar")}</div><span>REPEAT</span></div>
    </section>

    <section class="lp-final-cta"><div class="lp-final-road" aria-hidden="true"></div><p class="lp-overline">YOUR ROUTE. YOUR ROUTINE.</p><h2>Your next commute<br>could be <em>shared.</em></h2><p>Connect your daily journey with people travelling in the same direction.</p><div class="lp-hero-actions"><a class="lp-button lp-button-primary" href="${appHref}" data-link>${user ? "Open your commute" : "Start your commute"}<span aria-hidden="true">↗</span></a>${user?.role === "driver" ? "" : html`<a class="lp-button lp-button-secondary" href="/register" data-link>Join as a driver<span aria-hidden="true">↗</span></a>`}</div></section>

    <footer class="lp-footer"><div>${logo()}<span>Your route. Your routine. One shared ride.</span></div><nav aria-label="Footer"><a href="#how">How it works</a><a href="#technology">Technology</a><a href="#commuters">Commuters</a><a href="#drivers">Drivers</a></nav><small>CommuteLoop is a pilot-stage project. Route artwork is illustrative; live road routing is not connected in this build.</small></footer>
  </div>`;
}

export function mountLanding(host) {
  const root = host.querySelector(".lp-site");
  if (!root) return () => {};
  const canvas = root.querySelector("[data-city-scene]");
  const fallback = root.querySelector(".lp-city-fallback");
  const toggle = root.querySelector("[data-view-toggle]");
  const label = root.querySelector("[data-view-label]");
  let scene = null;
  let disposed = false;
  let sequence = 0;

  const storedView = (() => {
    try { return localStorage.getItem("cl_home_experience"); } catch { return null; }
  })();
  const setLabel = (view) => {
    root.dataset.experience = view;
    toggle.setAttribute("aria-pressed", String(view === "3d"));
    toggle.setAttribute("aria-label", view === "3d" ? "Switch to Classic View" : "Switch to 3D View");
    label.textContent = view === "3d" ? "3D view" : "Classic view";
  };
  const destroyScene = () => {
    scene?.destroy();
    scene = null;
  };
  const setView = async (view, persist = true) => {
    const request = ++sequence;
    setLabel(view);
    if (persist) {
      try { localStorage.setItem("cl_home_experience", view); } catch {}
    }
    if (view === "classic") {
      root.dataset.sceneFallback = "false";
      destroyScene();
      canvas.hidden = true;
      fallback.hidden = true;
      return;
    }
    let gl;
    try { gl = canvas.getContext("webgl2", { alpha: true, antialias: true, powerPreference: "low-power" }); } catch {}
    if (!gl) {
      destroyScene();
      setLabel("classic");
      try { localStorage.setItem("cl_home_experience", "classic"); } catch {}
      canvas.hidden = true;
      fallback.hidden = true;
      return;
    }
    canvas.hidden = false;
    fallback.hidden = true;
    root.dataset.sceneFallback = "false";
    try {
      const { mountMobilityScene } = await import("./mobility-scene.js");
      if (disposed || request !== sequence) return;
      scene = mountMobilityScene(canvas, gl);
      fallback.hidden = true;
    } catch (error) {
      if (disposed || request !== sequence) return;
      console.warn("CommuteLoop city scene fell back to its lightweight city artwork.", error);
      root.dataset.sceneFallback = "true";
      canvas.hidden = true;
      fallback.hidden = false;
    }
  };
  const onToggle = () => setView(root.dataset.experience === "3d" ? "classic" : "3d");
  toggle.addEventListener("click", onToggle);
  setView(storedView === "classic" ? "classic" : "3d", false);
  return () => {
    disposed = true;
    sequence += 1;
    toggle.removeEventListener("click", onToggle);
    destroyScene();
  };
}
