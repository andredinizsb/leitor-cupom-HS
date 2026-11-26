// HS Gestão · PIN do colaborador nos apps de campo (RDO, checklist, Compras/autorização, despesas).
// Uso: <script src="/ds/campo.js?v=1" defer></script> antes do </body>.
// - Guarda o PIN neste aparelho e manda no cabeçalho X-HS-Pin de todo POST para /api/ do próprio site.
// - Modo vem do servidor (Gestão > Acessos): desligado = nada aparece; aviso = botão "PIN" e lembrete; obrigatorio = pede o PIN antes de enviar.
(function () {
  "use strict";
  var LS = "hsPinCampo", modo = "desligado", eu = null;
  try { eu = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { eu = null; }
  function salvar(v) { eu = v; try { if (v) localStorage.setItem(LS, JSON.stringify(v)); else localStorage.removeItem(LS); } catch (e) {} desenhar(); }

  // ---- fetch com o PIN ----
  var orig = window.fetch.bind(window);
  function doSite(u) { try { var x = new URL(u, location.href); return x.origin === location.origin && x.pathname.indexOf("/api/") === 0 && x.pathname !== "/api/campo/pin"; } catch (e) { return false; } }
  window.fetch = function (u, op) {
    if (typeof u === "string" && op && String(op.method || "GET").toUpperCase() === "POST" && doSite(u)) {
      op = Object.assign({}, op);
      var h = new Headers(op.headers || {});
      if (eu && eu.pin) h.set("X-HS-Pin", eu.pin);
      op.headers = h;
      return orig(u, op).then(function (r) {
        if (r.status === 401 || r.status === 429) r.clone().json().then(function (j) {
          if (j && j.erro === "pin") abrir(j.msg);
          else if (j && /^limite/.test(j.erro || "")) aviso(j.msg);
        }).catch(function () {});
        return r;
      });
    }
    return orig(u, op);
  };

  // ---- tela ----
  var css = document.createElement("style");
  css.textContent = ".hsPin{position:fixed;left:10px;bottom:calc(10px + env(safe-area-inset-bottom));z-index:9000;font:600 13px/1 system-ui,sans-serif;border:1px solid rgba(127,127,127,.4);border-radius:999px;padding:8px 12px;background:#fff;color:#123;box-shadow:0 2px 8px rgba(0,0,0,.18);cursor:pointer}" +
    ".hsPin.falta{background:#FFF4D6;color:#6B4B00;border-color:#E8B93A}" +
    ".hsPinAv{position:fixed;left:10px;right:10px;bottom:calc(52px + env(safe-area-inset-bottom));z-index:9001;font:14px/1.35 system-ui,sans-serif;background:#FFF4D6;color:#4A3500;border:1px solid #E8B93A;border-radius:10px;padding:10px 12px;box-shadow:0 2px 10px rgba(0,0,0,.2)}" +
    ".hsPinDlg{border:0;border-radius:14px;padding:18px;max-width:340px;width:calc(100% - 32px);font:15px/1.4 system-ui,sans-serif}" +
    ".hsPinDlg::backdrop{background:rgba(0,0,0,.45)}.hsPinDlg input{font-size:24px;letter-spacing:.3em;text-align:center;width:100%;box-sizing:border-box;padding:10px;margin:10px 0;border:1px solid #999;border-radius:8px}" +
    ".hsPinDlg .b{display:flex;gap:8px;flex-wrap:wrap}.hsPinDlg button{flex:1;padding:11px;border-radius:8px;border:1px solid #999;background:#f3f3f3;font:600 15px system-ui,sans-serif}.hsPinDlg button.p{background:#0B5FFF;color:#fff;border-color:#0B5FFF}" +
    ".hsPinDlg .m{color:#555;font-size:13px}.hsPinDlg .e{color:#B00020;font-size:13px;min-height:1em}";
  document.head.appendChild(css);
  var bt = document.createElement("button"); bt.type = "button"; bt.className = "hsPin"; bt.hidden = true;
  var dl = document.createElement("dialog"); dl.className = "hsPinDlg";
  dl.innerHTML = '<b>PIN do colaborador</b><div class="m" data-x="msg">Digite o PIN que o escritório passou para você. Ele fica guardado neste celular.</div>' +
    '<input type="tel" inputmode="numeric" autocomplete="off" maxlength="8" aria-label="PIN"><div class="e" data-x="erro"></div>' +
    '<div class="b"><button type="button" class="p" data-x="ok">Confirmar</button><button type="button" data-x="fechar">Agora não</button></div>' +
    '<div class="b" style="margin-top:8px"><button type="button" data-x="sair" hidden>Tirar o PIN deste celular</button></div>';
  function q(x) { return dl.querySelector('[data-x="' + x + '"]'); }
  function desenhar() {
    bt.hidden = modo === "desligado" && !eu;
    bt.textContent = eu ? "👤 " + String(eu.nome || "").replace(/^\d+\s+/, "").split(" ")[0] : "🔑 PIN";
    bt.classList.toggle("falta", !eu);
    q("sair").hidden = !eu;
  }
  function abrir(msg) {
    q("msg").textContent = msg || "Digite o PIN que o escritório passou para você. Ele fica guardado neste celular.";
    q("erro").textContent = ""; dl.querySelector("input").value = "";
    if (!dl.open) { try { dl.showModal(); } catch (e) { dl.setAttribute("open", ""); } }
    dl.querySelector("input").focus();
  }
  function aviso(t) {
    var a = document.createElement("div"); a.className = "hsPinAv"; a.setAttribute("role", "status"); a.textContent = t;
    document.body.appendChild(a); setTimeout(function () { a.remove(); }, 9000); a.addEventListener("click", function () { a.remove(); });
  }
  q("ok").addEventListener("click", function () {
    var p = dl.querySelector("input").value.replace(/\D/g, "");
    if (p.length < 4) { q("erro").textContent = "O PIN tem pelo menos 4 números."; return; }
    q("ok").disabled = true;
    orig("/api/campo/pin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin: p }) })
      .then(function (r) { return r.json(); }).then(function (j) {
        q("ok").disabled = false;
        if (!j.ok) { q("erro").textContent = j.msg || "PIN não confere."; return; }
        salvar({ pin: p, nome: j.colaborador }); dl.close(); aviso("PIN confirmado: " + j.colaborador + ". Pode enviar normalmente.");
      }).catch(function () { q("ok").disabled = false; q("erro").textContent = "Sem internet agora. Tente de novo."; });
  });
  dl.querySelector("input").addEventListener("keydown", function (e) { if (e.key === "Enter") q("ok").click(); });
  q("fechar").addEventListener("click", function () { dl.close(); });
  q("sair").addEventListener("click", function () { salvar(null); dl.close(); });
  bt.addEventListener("click", function () { abrir(eu ? "Este celular está com o PIN de " + eu.nome + ". Para trocar, digite outro PIN." : ""); });
  document.body.appendChild(bt); document.body.appendChild(dl);

  orig("/api/campo/pin").then(function (r) { return r.json(); }).then(function (j) {
    modo = (j && j.modo) || "desligado"; desenhar();
    if (eu) return;
    if (modo === "obrigatorio") abrir("Para enviar por este app agora é preciso o PIN do colaborador. Peça o seu ao escritório.");
    else if (modo === "aviso") {
      var k = "hsPinAviso"; var visto = null; try { visto = sessionStorage.getItem(k); } catch (e) {}
      if (!visto) { aviso("Em breve este app vai pedir o PIN do colaborador. Peça o seu ao escritório e toque em 🔑 PIN."); try { sessionStorage.setItem(k, "1"); } catch (e) {} }
    }
  }).catch(function () {});
  desenhar();
})();
