import { api, session } from "../api.js";
import { $, html, icon, logo, raw } from "../ui.js";

const art = raw(`<svg class="bgmap" viewBox="0 0 520 300" aria-hidden="true"><path d="M20 40 C 120 60, 160 130, 240 160 S 400 230, 500 250" fill="none" stroke="#2e9e63" stroke-width="6" stroke-linecap="round"/><path d="M20 250 C 120 230, 180 200, 240 160" fill="none" stroke="#e8762b" stroke-width="4" stroke-dasharray="2 12" stroke-linecap="round"/><g fill="#fff"><circle cx="20" cy="40" r="10"/><circle cx="20" cy="250" r="10"/><circle cx="240" cy="160" r="10"/></g><rect x="486" y="236" width="28" height="28" rx="8" fill="#fff"/></svg>`);

export function authView(root, mode, config, onDone) {
  const st = { mode, step: "phone", phone: "", role: new URLSearchParams(location.search).get("role") === "driver" ? "driver" : "commuter", name: "", email: "", testOtp: null, busy: false, error: "" };

  function paint() {
    const reg = st.mode === "register";
    root.innerHTML = html`<div class="auth-wrap">
      <aside class="auth-art">${logo()}<div><h2>${reg ? "Plan your commute once. Ride on the days you choose." : "Welcome back to your routine."}</h2><p>${reg ? "Commuters and drivers get started with just a mobile number." : "Sign in with a one-time code sent to your mobile number."}</p></div>${art}<span class="small" style="color:#8d9bb8">Your route. Your routine. One shared ride.</span></aside>
      <main class="auth-form" id="main"><div class="box stack">
        <div class="row spread"><a class="link small" href="/" data-link>← Back to home</a></div>
        <h1>${st.step === "code" ? "Enter your code" : reg ? "Create your account" : "Sign in"}</h1>
        ${st.step === "phone" ? phoneStep(reg) : codeStep(reg)}
        ${st.error ? html`<div class="notice red" role="alert">${st.error}</div>` : ""}
        <p class="small muted">${reg ? html`Already have an account? <a href="/login" data-link>Sign in</a>` : html`New to CommuteLoop? <a href="/register" data-link>Create an account</a>`}</p>
      </div></main></div>`.s;
    bind();
  }

  const phoneStep = (reg) => html`<form id="f-phone" class="stack" novalidate>
    ${reg ? html`<fieldset style="border:0;padding:0;margin:0"><legend class="sr">I am joining as</legend>
      <div class="seg"><label><input type="radio" name="role" value="commuter" ${st.role === "commuter" ? "checked" : ""}><span>${icon("user")} Commuter</span></label>
      <label><input type="radio" name="role" value="driver" ${st.role === "driver" ? "checked" : ""}><span>${icon("car")} Driver</span></label></div></fieldset>
      <label class="field"><span class="lbl">Full name</span><input type="text" name="name" autocomplete="name" required minlength="2" value="${st.name}"></label>` : ""}
    <label class="field"><span class="lbl">Mobile number</span><input type="tel" name="phone" inputmode="numeric" autocomplete="tel" placeholder="98765 43210" required value="${st.phone}"><span class="hint">We'll send a 6-digit code. Indian numbers need no country code.</span></label>
    ${reg ? html`<label class="field"><span class="lbl">Email (optional)</span><input type="email" name="email" autocomplete="email" value="${st.email}"></label>` : ""}
    <button class="btn block" ${st.busy ? "disabled" : ""}>${st.busy ? "Sending…" : "Send code"}</button></form>`;

  const codeStep = () => html`<form id="f-code" class="stack" novalidate>
    <p class="muted">We sent a code to <strong>${st.phone}</strong>. <button type="button" class="link" id="change">Change number</button></p>
    ${st.testOtp ? html`<div class="otp-test" role="note"><div><span class="badge sim">TEST OTP</span><div class="small" style="margin-top:6px;color:#7a3a0a">No SMS provider is connected, so the code is shown here. Real accounts will get it by SMS.</div></div><code>${st.testOtp}</code></div>` : ""}
    <label class="field"><span class="lbl">6-digit code</span><input type="text" name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required autofocus></label>
    <button class="btn block" ${st.busy ? "disabled" : ""}>${st.busy ? "Checking…" : st.mode === "register" ? "Create account" : "Sign in"}</button>
    <button type="button" class="btn ghost block" id="resend">Send a new code</button></form>`;

  async function sendCode() {
    st.busy = true; st.error = ""; paint();
    try {
      const r = await api("/auth/request-otp", { method: "POST", body: { phone: st.phone, purpose: st.mode } });
      st.phone = r.phone; st.testOtp = r.test_otp || null; st.step = "code";
    } catch (e) { st.error = e.message; }
    st.busy = false; paint();
  }

  function bind() {
    const f1 = $("#f-phone", root);
    f1?.addEventListener("change", (e) => { if (e.target.name === "role") st.role = e.target.value; });
    f1?.addEventListener("submit", (e) => {
      e.preventDefault();
      const d = new FormData(f1);
      st.phone = d.get("phone").trim(); st.name = (d.get("name") || "").trim(); st.email = (d.get("email") || "").trim();
      st.role = d.get("role") || st.role;
      if (!st.phone) { st.error = "Enter your mobile number."; return paint(); }
      if (st.mode === "register" && st.name.length < 2) { st.error = "Enter your full name."; return paint(); }
      sendCode();
    });
    $("#change", root)?.addEventListener("click", () => { st.step = "phone"; st.error = ""; paint(); });
    $("#resend", root)?.addEventListener("click", sendCode);
    const f2 = $("#f-code", root);
    f2?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const otp = new FormData(f2).get("otp").trim();
      if (!/^\d{6}$/.test(otp)) { st.error = "The code is 6 digits."; return paint(); }
      st.busy = true; st.error = ""; paint();
      try {
        const body = st.mode === "register" ? { phone: st.phone, otp, full_name: st.name, role: st.role, email: st.email || null } : { phone: st.phone, otp };
        const r = await api(`/auth/${st.mode}`, { method: "POST", body });
        session.set(r.token, r.user);
        onDone(r.user);
      } catch (err) { st.busy = false; st.error = err.message; paint(); }
    });
  }
  paint();
}
