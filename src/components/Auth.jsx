import React, { useState } from "react";
import { Sun, CheckCircle2, AlertTriangle } from "lucide-react";

const friendly = (m = "") => {
  if (/invalid login/i.test(m)) return "E-mail ou senha incorretos.";
  if (/not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (/already registered|already exists/i.test(m)) return "Este e-mail já tem conta. Entre ou recupere a senha.";
  if (/password/i.test(m) && /(least|short|weak)/i.test(m)) return "A senha precisa ter pelo menos 8 caracteres.";
  if (/rate limit|too many|security purposes/i.test(m)) return "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
  return "Não foi possível concluir. Verifique a conexão e tente de novo.";
};
const TITLES = {
  entrar: ["Entre na sua conta", "Suas viagens, cotações e pagamentos em qualquer dispositivo."],
  criar: ["Crie sua conta", "Gratuita. Seus dados ficam visíveis só para você."],
  recuperar: ["Recuperar senha", "Enviaremos um link para você criar uma nova senha."],
  nova: ["Crie uma nova senha", "Escolha uma senha com pelo menos 8 caracteres."],
};

export default function Auth({ supabase, recovery, onRecovered }) {
  const [mode, setMode] = useState("entrar");
  const m = recovery ? "nova" : mode;
  const [email, setEmail] = useState(""); const [pw, setPw] = useState(""); const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(null);
  const go = (x) => { setMode(x); setMsg(null); setPw(""); setPw2(""); };

  const submit = async (e) => {
    e.preventDefault(); setMsg(null);
    if (m !== "nova" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setMsg({ t: "err", x: "Informe um e-mail válido." });
    if ((m === "criar" || m === "nova" || m === "entrar") && pw.length < (m === "entrar" ? 1 : 8)) return setMsg({ t: "err", x: m === "entrar" ? "Informe a senha." : "A senha precisa ter pelo menos 8 caracteres." });
    if ((m === "criar" || m === "nova") && pw !== pw2) return setMsg({ t: "err", x: "As senhas não conferem." });
    setBusy(true);
    try {
      const redirect = window.location.origin;
      if (m === "entrar") { const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw }); if (error) throw error; }
      if (m === "criar") {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { emailRedirectTo: redirect } });
        if (error) throw error;
        if (!data.session) setMsg({ t: "ok", x: `Enviamos um link de confirmação para ${email.trim()}. Depois de confirmar, entre com sua senha.` });
      }
      if (m === "recuperar") { const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: redirect }); if (error) throw error; setMsg({ t: "ok", x: "Se houver uma conta com esse e-mail, o link de recuperação chegará em instantes." }); }
      if (m === "nova") { const { error } = await supabase.auth.updateUser({ password: pw }); if (error) throw error; onRecovered(); }
    } catch (err) { setMsg({ t: "err", x: friendly(err?.message) }); }
    setBusy(false);
  };

  const [title, sub] = TITLES[m];
  return (
    <div className="fp auth-wrap">
      <div className="auth-card">
        <div className="logo" style={{ padding: 0 }}><div className="logo-mark" style={{ background: "#DDF4FA" }}><Sun size={20} /></div><div><b style={{ color: "#173A4A" }}>Férias Planejadas</b><small style={{ color: "#5C7884" }}>planejar, comparar, aproveitar</small></div></div>
        <h1 className="serif">{title}</h1>
        <p className="muted" style={{ margin: 0 }}>{sub}</p>
        <form onSubmit={submit} noValidate>
          {m !== "nova" && <div className="fld"><label><span className="lb">E-mail</span><input className="inp" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label></div>}
          {m !== "recuperar" && <div className="fld"><label><span className="lb">{m === "nova" ? "Nova senha" : "Senha"}</span><input className="inp" type="password" autoComplete={m === "entrar" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} /></label></div>}
          {(m === "criar" || m === "nova") && <div className="fld"><label><span className="lb">Confirme a senha</span><input className="inp" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></label></div>}
          {msg && <div className={`alert ${msg.t === "err" ? "red" : "blue"}`}>{msg.t === "err" ? <AlertTriangle size={15} color="#D9534F" /> : <CheckCircle2 size={15} color="#167D9A" />}<span>{msg.x}</span></div>}
          <button className="btn pri" type="submit" disabled={busy} style={{ justifyContent: "center", padding: "11px 14px", fontSize: 14 }}>
            {busy ? "Aguarde…" : { entrar: "Entrar", criar: "Criar conta", recuperar: "Enviar link", nova: "Salvar nova senha" }[m]}
          </button>
        </form>
        {m !== "nova" && <div className="auth-links">
          {m === "entrar" ? <><button onClick={() => go("criar")}>Criar conta</button><button onClick={() => go("recuperar")}>Esqueci a senha</button></> : <button onClick={() => go("entrar")}>Voltar para entrar</button>}
        </div>}
      </div>
    </div>
  );
}
