"use client";

/**
 * Toast liquid glass del diseño axcStudios (píldora superior centrada).
 * Uso: axcToast("mensaje") desde cualquier cliente + <AxcToastPort /> montado una vez.
 */
import { useEffect, useState } from "react";

type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

let toastTimer: ReturnType<typeof setTimeout> | null = null;
let current = "";

export function axcToast(msg: string): void {
  current = msg;
  listeners.forEach((l) => l(msg));
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    current = "";
    listeners.forEach((l) => l(""));
  }, 3600);
}

export default function AxcToastPort() {
  const [msg, setMsg] = useState(current);

  useEffect(() => {
    const l: Listener = (m) => setMsg(m);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  return (
    <div className={`axcui-toast${msg ? " show" : ""}`} role="status" aria-live="polite">
      {msg}
    </div>
  );
}
