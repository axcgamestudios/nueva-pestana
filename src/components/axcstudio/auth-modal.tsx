"use client";

/**
 * MODAL DE CUENTAS liquid glass del diseño axcStudios (axc-ui.js):
 * pestañas Entrar / Crear cuenta, registro en 2 pasos con código OTP de 6
 * dígitos que LLEGA SOLO al BUZÓN AXC (se descarga del servidor textdb y se
 * escribe automáticamente), reenvío con cooldown y puntos de estado del
 * servidor + red. Usa el SSO axc (mismo token que axcStudios).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useSyncExternalStore } from "react";
import { AXC, getAxcSnapshot, subscribeAxc, type AxcMail } from "@/lib/axc-auth";
import { asset } from "@/lib/paths";
import { axcToast } from "./axc-toast";

type Tab = "login" | "signup1" | "signup2";

export default function AuthModal({
  open,
  onClose,
  initialTab = "login",
}: {
  open: boolean;
  onClose: () => void;
  initialTab?: "login" | "signup";
}) {
  const axc = useSyncExternalStore(subscribeAxc, getAxcSnapshot, getAxcSnapshot);
  const [tab, setTab] = useState<Tab>("login");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [mail, setMail] = useState<AxcMail | null>(null);
  const [mailSecs, setMailSecs] = useState(0);
  const [resendLeft, setResendLeft] = useState(0);
  const [otp, setOtp] = useState<string[]>(["", "", "", "", "", ""]);
  const [signupMail, setSignupMail] = useState("");
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollT0 = useRef(0);
  const resendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Al abrir: pestaña inicial y limpieza
  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicia el formulario cada vez que se abre el modal
      setTab(initialTab === "signup" ? "signup1" : "login");
      setErr("");
      setMail(null);
      setOtp(["", "", "", "", "", ""]);
      window.setTimeout(() => otpRefs.current[0]?.focus(), 350);
    }
  }, [open, initialTab]);

  // ESC cierra
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => stopPoll, [stopPoll]);

  /* ---------- BUZÓN AXC: el código llega y SE MUESTRA solo ---------- */
  const startPoll = useCallback(() => {
    stopPoll();
    pollT0.current = Date.now();
    setMailSecs(0);
    const poll = async () => {
      const m = await AXC.fetchMail();
      if (m) {
        stopPoll();
        setMail(m);
        setOtp(m.code.split(""));
        axcToast("📬 Código recibido en el buzón axc ✓");
      } else {
        setMailSecs(Math.round((Date.now() - pollT0.current) / 1000));
      }
    };
    pollRef.current = setInterval(() => void poll(), 2000);
    void poll();
  }, [stopPoll]);

  /* ---------- LOGIN ---------- */
  const doLogin = async () => {
    const u = (document.getElementById("axcLu") as HTMLInputElement | null)?.value ?? "";
    const p = (document.getElementById("axcLp") as HTMLInputElement | null)?.value ?? "";
    if (!u || !p) {
      setErr("Escribe tu usuario y contraseña");
      return;
    }
    setBusy(true);
    setErr("");
    const r = await AXC.login({ user: u, pass: p });
    setBusy(false);
    if (r.ok) {
      axcToast(`¡Bienvenido, ${r.user}! Sesión iniciada`);
      window.dispatchEvent(new CustomEvent("axc:pulse"));
      onClose();
    } else {
      setErr(r.error);
      if (/no existe/i.test(r.error)) setTab("signup1");
    }
  };

  /* ---------- SIGNUP paso 1 ---------- */
  const doSignup = async () => {
    const u = (document.getElementById("axcSu") as HTMLInputElement | null)?.value ?? "";
    const m = (document.getElementById("axcSm") as HTMLInputElement | null)?.value ?? "";
    const p = (document.getElementById("axcSp") as HTMLInputElement | null)?.value ?? "";
    setBusy(true);
    setErr("");
    const r = await AXC.signup({ user: u, mail: m, pass: p });
    setBusy(false);
    if (r.ok) {
      setSignupMail(r.mail);
      setTab("signup2");
      setMail(null);
      startPoll();
    } else {
      setErr(r.error);
    }
  };

  /* ---------- SIGNUP paso 2: verificar ---------- */
  const doVerify = async () => {
    const code = otp.join("");
    if (code.replace(/\D/g, "").length !== 6) {
      setErr("Escribe el código de 6 dígitos");
      return;
    }
    setBusy(true);
    setErr("");
    const r = await AXC.verify(code);
    setBusy(false);
    if (r.ok) {
      stopPoll();
      axcToast(`🎉 ¡Cuenta creada, ${r.user}! Sesión iniciada`);
      window.dispatchEvent(new CustomEvent("axc:pulse"));
      onClose();
    } else {
      setErr(r.error);
    }
  };

  /* ---------- reenviar código (cooldown 45 s) ---------- */
  const doResend = async () => {
    if (resendLeft > 0 || busy) return;
    setBusy(true);
    const r = await AXC.sendCode();
    setBusy(false);
    if (r.ok) {
      setMail(null);
      startPoll();
      setResendLeft(45);
      const btn = document.getElementById("axcRb");
      const tick = () => {
        setResendLeft((v) => {
          if (v <= 1) {
            if (resendTimer.current) clearTimeout(resendTimer.current);
            if (btn) btn.textContent = "Reenviar código";
            return 0;
          }
          if (btn) btn.textContent = `Reenviar en ${v - 1}s`;
          resendTimer.current = setTimeout(tick, 1000);
          return v - 1;
        });
      };
      resendTimer.current = setTimeout(tick, 1000);
      axcToast("Código reenviado ✓");
    } else {
      setErr(r.error);
    }
  };

  useEffect(
    () => () => {
      if (resendTimer.current) clearTimeout(resendTimer.current);
    },
    [],
  );

  if (!open) return null;

  const dots = (
    <div className="axcui-dots">
      {axc.db === true ? (
        <span className="axcui-dot on">
          <i /> Servidor de cuentas
        </span>
      ) : axc.db === false ? (
        <span className="axcui-dot">
          <i style={{ background: "#ff4d6d" }} /> Servidor caído
        </span>
      ) : (
        <span className="axcui-dot wait">
          <i /> Conectando servidor…
        </span>
      )}
      {axc.ws === "online" ? (
        <span className="axcui-dot on">
          <i /> Red axc en vivo
        </span>
      ) : axc.ws === "connecting" ? (
        <span className="axcui-dot wait">
          <i /> Red axc conectando…
        </span>
      ) : (
        <span className="axcui-dot">
          <i /> Red axc dormida
        </span>
      )}
    </div>
  );

  return (
    <div
      className="axcui-root open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="axcui-card">
        <button className="axcui-x" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
        <div className="axcui-logo">
          { }
          <img src={asset("/axc/icon-192.png")} alt="axcGames" />
          <div>
            <b>cuenta axc</b>
            <span>una cuenta · todas las páginas</span>
          </div>
        </div>

        <div className="axcui-tabs">
          <button
            className={`axcui-tab${tab === "login" ? " on" : ""}`}
            onClick={() => {
              setTab("login");
              setErr("");
              stopPoll();
            }}
          >
            Entrar
          </button>
          <button
            className={`axcui-tab${tab !== "login" ? " on" : ""}`}
            onClick={() => {
              setTab("signup1");
              setErr("");
              stopPoll();
            }}
          >
            Crear cuenta
          </button>
        </div>

        {err && (
          <div className="axcui-err" style={{ display: "block" }}>
            {err}
          </div>
        )}

        {tab === "login" && (
          <div
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target instanceof HTMLInputElement) void doLogin();
            }}
          >
            <div className="axcui-f">
              <label htmlFor="axcLu">Usuario</label>
              <input id="axcLu" autoComplete="username" spellCheck={false} />
            </div>
            <div className="axcui-f">
              <label htmlFor="axcLp">Contraseña</label>
              <input id="axcLp" type="password" autoComplete="current-password" />
            </div>
            <button className="axcui-btn" onClick={() => void doLogin()} disabled={busy}>
              {busy ? "Verificando…" : "Entrar →"}
            </button>
            <p className="axcui-note">
              La misma cuenta funciona en <strong>todas las páginas axcStudios</strong> (tienda,
              juegos y cualquier sitio que use el sistema axc).
            </p>
          </div>
        )}

        {tab === "signup1" && (
          <div
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target instanceof HTMLInputElement) void doSignup();
            }}
          >
            <div className="axcui-f">
              <label htmlFor="axcSu">
                Usuario <span style={{ opacity: 0.5 }}>(3-16, letras/números/_)</span>
              </label>
              <input id="axcSu" autoComplete="username" spellCheck={false} placeholder="tu_nombre" />
            </div>
            <div className="axcui-f">
              <label htmlFor="axcSm">
                Correo <span style={{ opacity: 0.5 }}>(un detalle de perfil)</span>
              </label>
              <input id="axcSm" type="email" autoComplete="email" placeholder="tu@ejemplo.com" />
            </div>
            <div className="axcui-f">
              <label htmlFor="axcSp">
                Contraseña <span style={{ opacity: 0.5 }}>(mín. 6)</span>
              </label>
              <input id="axcSp" type="password" autoComplete="new-password" />
            </div>
            <button className="axcui-btn" onClick={() => void doSignup()} disabled={busy}>
              {busy ? "Enviando código…" : "📨 Enviar código de verificación"}
            </button>
            <p className="axcui-note">
              Tu código de 6 dígitos llega <strong>al instante al buzón axc</strong> (lo ves aquí
              mismo, en grande y automáticamente). Tu contraseña se guarda cifrada (PBKDF2,
              nunca en texto plano).
            </p>
          </div>
        )}

        {tab === "signup2" && (
          <div>
            <div className="axcui-ok">
              📨 Código enviado. Válido durante <strong>15 minutos</strong>. El buzón axc de
              abajo <strong>lo recibe automáticamente en segundos</strong> y lo escribe por ti.
            </div>
            <div className={`axcui-mail${mail ? " arrived" : " waiting"}`}>
              <div className="axcui-mail-h">
                <span className="dot" />✉ BUZÓN AXC · EN VIVO
              </div>
              {mail ? (
                <>
                  <div className="axcui-mail-b">
                    📬 <b>¡Código recibido!</b> · de <b>{mail.from}</b> · ahora mismo
                  </div>
                  <div className="axccode">
                    {mail.code.split("").map((d, i) => (
                      <i key={i}>{d}</i>
                    ))}
                  </div>
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: 12,
                      color: "#7ff0b0",
                      marginBottom: 4,
                    }}
                  >
                    ✓ Escrito automáticamente abajo
                  </div>
                </>
              ) : (
                <div className="axcui-mail-b">
                  <span className="axcenv">✉️</span>Esperando el correo del servidor…{" "}
                  <span style={{ opacity: 0.55 }}>({mailSecs}s)</span>
                  {mailSecs > 18 && (
                    <>
                      <br />
                      <span style={{ fontSize: 12, color: "#f5b942" }}>
                        ¿Tarda más de 20s? Pulsa <b>Reenviar código</b>: a veces el servidor
                        tarda un momento en despertar.
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="axcui-f">
              <label>Escribe el código de 6 dígitos</label>
              <div className="axcui-otp">
                {otp.map((v, i) => (
                  <input
                    key={i}
                    ref={(el) => {
                      otpRefs.current[i] = el;
                    }}
                    maxLength={1}
                    inputMode="numeric"
                    value={v}
                    className={v ? "filled" : ""}
                    onChange={(e) => {
                      const nv = e.target.value.replace(/\D/g, "").slice(-1);
                      setOtp((prev) => {
                        const next = [...prev];
                        next[i] = nv;
                        return next;
                      });
                      if (nv && i < 5) otpRefs.current[i + 1]?.focus();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace" && !otp[i] && i > 0) {
                        otpRefs.current[i - 1]?.focus();
                      }
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const d = (e.clipboardData.getData("text") || "")
                        .replace(/\D/g, "")
                        .slice(0, 6);
                      setOtp(d.split(""));
                      otpRefs.current[Math.min(d.length, 5)]?.focus();
                    }}
                  />
                ))}
              </div>
            </div>
            <button className="axcui-btn" onClick={() => void doVerify()} disabled={busy}>
              {busy ? "Verificando…" : "✓ Verificar y crear cuenta"}
            </button>
            <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
              <button
                className="axcui-btn ghost"
                id="axcRb"
                style={{ fontSize: "13.5px" }}
                onClick={() => void doResend()}
                disabled={resendLeft > 0 || busy}
              >
                Reenviar código
              </button>
              <button
                className="axcui-btn ghost"
                style={{ fontSize: "13.5px" }}
                onClick={() => {
                  stopPoll();
                  setTab("signup1");
                  setErr("");
                }}
              >
                Cambiar datos
              </button>
            </div>
            {signupMail && (
              <p className="axcui-note" style={{ textAlign: "center" }}>
                Enviado a <strong>{signupMail}</strong>
              </p>
            )}
          </div>
        )}

        {dots}
      </div>
    </div>
  );
}
