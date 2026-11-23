import { useState } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { shortKey } from "../lib/format";

export type IconName = "bolt" | "plus" | "play" | "lock" | "unlock" | "download" | "volume" | "mute" | "refresh" | "coins" | "check" | "users" | "radio" | "close";

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const paths: Record<IconName, ReactNode> = {
    bolt: <path d="m13 2-9 12h7l-1 8 9-12h-7l1-8Z" />,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    play: <path d="m8 5 11 7-11 7V5Z" />,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    unlock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 7.5-2" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M5 21h14" /></>,
    volume: <><path d="M11 5 6 9H3v6h3l5 4V5ZM15 9a4 4 0 0 1 0 6M18 6a8 8 0 0 1 0 12" /></>,
    mute: <><path d="M11 5 6 9H3v6h3l5 4V5ZM16 9l5 6m0-6-5 6" /></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M6.1 8a7 7 0 0 1 11.7-1L20 12M4 12l2.2 5a7 7 0 0 0 11.7-1" /></>,
    coins: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    users: <><circle cx="9" cy="8" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2" /></>,
    radio: <><circle cx="12" cy="12" r="2" /><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  busy?: boolean;
  icon?: IconName;
}

export function Button({ variant = "secondary", busy = false, icon, className = "", children, disabled, ...props }: ButtonProps) {
  const variants = {
    primary: "border-acid bg-acid text-[#10150c] hover:bg-[#d7ff7d] shadow-[0_0_24px_rgba(200,246,93,0.12)]",
    secondary: "border-line bg-white/[0.035] text-slate-200 hover:border-slate-500 hover:bg-white/[0.07]",
    ghost: "border-transparent bg-transparent text-slate-400 hover:bg-white/[0.05] hover:text-slate-100",
    danger: "border-red-900/60 bg-red-950/20 text-red-300 hover:border-red-700 hover:bg-red-950/40",
  };
  return (
    <button {...props} disabled={disabled || busy} className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-2 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] transition-all disabled:opacity-40 ${variants[variant]} ${className}`}>
      {busy ? <span className="h-3.5 w-3.5 animate-spin rounded-full border border-current border-t-transparent" /> : icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </button>
  );
}

export function Panel({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <header className="relative z-10 flex items-center justify-between gap-3 border-b border-line/80 px-5 py-4">
        <div>
          {eyebrow ? <div className="eyebrow mb-1">{eyebrow}</div> : null}
          <h2 className="text-sm font-semibold tracking-tight text-slate-100">{title}</h2>
        </div>
        {action}
      </header>
      <div className="relative z-10">{children}</div>
    </section>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "live" | "warn" | "acid" }) {
  const tones = {
    neutral: "border-slate-700/70 bg-slate-800/40 text-slate-400",
    live: "border-mint/20 bg-mint/10 text-mint",
    warn: "border-amber/20 bg-amber/10 text-amber",
    acid: "border-acid/20 bg-acid/10 text-acid",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[9px] font-semibold uppercase tracking-[0.13em] ${tones[tone]}`}>{children}</span>;
}

export function KeyLabel({ value, className = "" }: { value: { toBase58(): string } | string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const key = typeof value === "string" ? value : value.toBase58();
  const copy = async () => {
    await navigator.clipboard.writeText(key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <button type="button" onClick={copy} title={`${key} — click to copy`} className={`inline-flex items-center gap-1.5 font-mono text-[10px] text-slate-500 transition-colors hover:text-mint ${className}`}>
      {copied ? <Icon name="check" size={11} /> : null}
      {copied ? "Copied" : shortKey(key)}
    </button>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex min-h-44 flex-col items-center justify-center px-6 py-10 text-center">
      <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-line bg-black/20 text-slate-600"><Icon name="radio" size={21} /></div>
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <p className="mt-2 max-w-sm text-xs leading-5 text-slate-500">{detail}</p>
    </div>
  );
}
