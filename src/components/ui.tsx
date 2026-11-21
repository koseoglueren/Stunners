import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-mute">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <div className="card">
      <div className="text-xs tracking-wide text-mute uppercase">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${accent ? "text-gold" : "text-ink"}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-mute">{hint}</div>}
    </div>
  );
}

const tones = {
  gold: "border-gold/40 bg-gold/10 text-gold-2",
  green: "border-good/40 bg-good/10 text-green-300",
  red: "border-blood/50 bg-blood/15 text-red-300",
  orange: "border-warn/40 bg-warn/10 text-orange-300",
  gray: "border-line bg-panel-2 text-mute",
} as const;

export function Badge({ tone = "gray", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={`badge ${tones[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-mute">{children}</div>;
}

export function Alert({ tone = "red", children }: { tone?: "red" | "green" | "gold"; children: ReactNode }) {
  const c =
    tone === "green"
      ? "border-good/40 bg-good/10 text-green-200"
      : tone === "gold"
        ? "border-gold/40 bg-gold/10 text-gold-2"
        : "border-blood/50 bg-blood/15 text-red-200";
  return <div className={`mb-4 rounded-lg border px-4 py-3 text-sm ${c}`}>{children}</div>;
}

export function MemberLink({ user }: { user: { id: string; characterName: string } }) {
  return (
    <Link href={`/members/${user.id}`} className="text-ink hover:text-gold">
      {user.characterName}
    </Link>
  );
}
