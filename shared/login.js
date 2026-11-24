// E-mail and password sign-in, shared by Meu Painel and Meu Financeiro (the Google button stays as it is).
// Firebase Auth does the work: it stores the password safely, sends the confirmation and reset e-mails.
// A new account must confirm its e-mail before entering; the access list still decides who gets in.

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "text") n.textContent = v;
    else if (k === "class") n.className = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) n.append(c);
  return n;
};
const MIN_PASSWORD = 8;
const looksLikeEmail = s => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
// Where the links in Firebase's e-mails bring the person back to.
const backHere = () => ({ url: location.origin + location.pathname });

export function authError(e) {
  const c = (e && e.code) || "";
  if (c === "auth/invalid-credential" || c === "auth/wrong-password" || c === "auth/user-not-found" || c === "auth/invalid-login-credentials")
    return "E-mail ou senha incorretos. Se você criou a conta com o Google, use \"Entrar com Google\".";
  if (c === "auth/email-already-in-use") return "Já existe uma conta com esse e-mail. Entre com a senha, use \"Esqueci a senha\" ou, se foi criada com o Google, \"Entrar com Google\".";
  if (c === "auth/invalid-email") return "Esse e-mail não parece válido.";
  if (c === "auth/weak-password") return "Senha fraca. Use pelo menos " + MIN_PASSWORD + " caracteres.";
  if (c === "auth/too-many-requests") return "Muitas tentativas seguidas. Espere alguns minutos e tente de novo.";
  if (c === "auth/operation-not-allowed") return "O login com e-mail e senha ainda não foi ativado no Firebase (Authentication → Método de login → E-mail/senha).";
  if (c === "auth/network-request-failed") return "Sem conexão com a internet. Verifique e tente de novo.";
  if (c === "auth/user-disabled") return "Esta conta foi desativada.";
  return "Não foi possível concluir. Tente de novo.";
}

// The e-mail and password form under the Google button: enter, create an account, or reset the password.
export function mountPasswordLogin(auth, box) {
  let mode = "entrar", busy = false;
  const err = el("p", { class: "form-error pw-err", role: "alert", hidden: true });
  const ok = el("p", { class: "pw-ok", role: "status", hidden: true });
  const say = (msg, good) => { err.hidden = true; ok.hidden = true; const t = good ? ok : err; t.textContent = msg; t.hidden = !msg; };

  function paint() {
    const name = el("input", { class: "field", id: "pw-name", type: "text", autocomplete: "name", placeholder: "Seu nome", "aria-label": "Seu nome" });
    const email = el("input", { class: "field", id: "pw-email", type: "email", autocomplete: "email", inputmode: "email", placeholder: "E-mail", "aria-label": "E-mail", required: true });
    const pass = el("input", { class: "field", id: "pw-pass", type: "password", autocomplete: mode === "criar" ? "new-password" : "current-password", placeholder: mode === "criar" ? "Crie uma senha (mín. " + MIN_PASSWORD + " caracteres)" : "Senha", "aria-label": "Senha" });
    const show = el("button", { type: "button", class: "pw-show", text: "mostrar", "aria-label": "Mostrar a senha",
      onclick: () => { const on = pass.type === "password"; pass.type = on ? "text" : "password"; show.textContent = on ? "ocultar" : "mostrar"; } });
    const submit = el("button", { type: "submit", class: "btn wide", id: "pw-submit",
      text: mode === "criar" ? "Criar conta" : mode === "recuperar" ? "Enviar link para nova senha" : "Entrar com e-mail" });
    const form = el("form", { class: "pw-form", novalidate: true },
      mode === "criar" ? name : null,
      email,
      mode === "recuperar" ? null : el("div", { class: "pw-pass" }, pass, show),
      submit);
    form.addEventListener("submit", async e => {
      e.preventDefault();
      if (busy) return;
      const em = email.value.trim().toLowerCase();
      if (!looksLikeEmail(em)) { say("Digite um e-mail válido."); email.focus(); return; }
      if (mode !== "recuperar" && !pass.value) { say("Digite a senha."); pass.focus(); return; }
      if (mode === "criar" && pass.value.length < MIN_PASSWORD) { say("A senha precisa ter pelo menos " + MIN_PASSWORD + " caracteres."); pass.focus(); return; }
      busy = true; submit.disabled = true; say("");
      try {
        if (mode === "entrar") await auth.signInWithEmailAndPassword(em, pass.value);
        else if (mode === "criar") {
          const cred = await auth.createUserWithEmailAndPassword(em, pass.value);
          if (name.value.trim()) await cred.user.updateProfile({ displayName: name.value.trim() });
          await cred.user.sendEmailVerification(backHere());
        } else {
          await auth.sendPasswordResetEmail(em, backHere());
          // Same answer whether or not the account exists, so the form does not reveal who is registered.
          say("Se existir uma conta com " + em + ", o link para criar uma nova senha chega em instantes. Veja também o spam.", true);
          busy = false; submit.disabled = false; return;
        }
      } catch (e2) {
        if (mode === "recuperar" && (e2 && e2.code) === "auth/user-not-found") say("Se existir uma conta com " + em + ", o link para criar uma nova senha chega em instantes. Veja também o spam.", true);
        else say(authError(e2));
      }
      busy = false; submit.disabled = false;
    });
    const links = el("div", { class: "pw-links" },
      mode !== "entrar" ? el("button", { type: "button", class: "link", text: "Já tenho conta: entrar", onclick: () => { mode = "entrar"; say(""); paint(); } }) : null,
      mode !== "criar" ? el("button", { type: "button", class: "link", text: "Criar conta com e-mail", onclick: () => { mode = "criar"; say(""); paint(); } }) : null,
      mode !== "recuperar" ? el("button", { type: "button", class: "link", text: "Esqueci a senha", onclick: () => { mode = "recuperar"; say(""); paint(); } }) : null);
    box.replaceChildren(...[el("div", { class: "pw-or", text: "ou" }), form, err, ok, links,
      mode === "criar" ? el("p", { class: "pw-note", text: "Depois de criar, confirme o e-mail pelo link que vamos enviar. Para entrar, o seu e-mail também precisa estar liberado por quem administra o painel." }) : null].filter(Boolean));
  }
  paint();
}

// Shown after sign-in while the e-mail is not confirmed yet.
export function renderVerify(box, user, { onVerified }) {
  let wait = 0, timer = null;
  const msg = el("p", { class: "pw-note" }, "Enviamos um link de confirmação para ", el("b", { text: user.email || "o seu e-mail" }), ". Abra o e-mail (veja também o spam), clique no link e volte aqui.");
  const err = el("p", { class: "form-error pw-err", role: "alert", hidden: true });
  const ok = el("p", { class: "pw-ok", role: "status", hidden: true });
  const done = el("button", { type: "button", class: "btn primary wide", id: "verify-done", text: "Já confirmei",
    onclick: async () => {
      done.disabled = true; err.hidden = true;
      try {
        await user.reload();
        if (user.emailVerified) { await user.getIdToken(true); onVerified(); return; }
        err.textContent = "Ainda não aparece como confirmado. Clique no link do e-mail e tente de novo."; err.hidden = false;
      } catch (e) { err.textContent = authError(e); err.hidden = false; }
      done.disabled = false;
    } });
  const again = el("button", { type: "button", class: "btn wide", id: "verify-again", text: "Reenviar o e-mail",
    onclick: async () => {
      if (wait > 0) return;
      again.disabled = true; err.hidden = true;
      try { await user.sendEmailVerification(backHere()); ok.textContent = "E-mail reenviado."; ok.hidden = false; }
      catch (e) { err.textContent = authError(e); err.hidden = false; }
      wait = 60; clearInterval(timer);
      timer = setInterval(() => { wait--; again.textContent = wait > 0 ? "Reenviar o e-mail (" + wait + "s)" : "Reenviar o e-mail"; if (wait <= 0) { clearInterval(timer); again.disabled = false; } }, 1000);
    } });
  box.replaceChildren(msg, err, ok, done, again);
  box.hidden = false;
}
