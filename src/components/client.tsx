"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function SubmitButton({ children, className = "btn-primary", confirm: msg }: { children: ReactNode; className?: string; confirm?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (msg && !window.confirm(msg)) e.preventDefault();
      }}
    >
      {pending ? "..." : children}
    </button>
  );
}

const dtf = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("tr-TR", opts);

/** Renders a date in the viewer's own time zone. */
export function LocalTime({ value, mode = "datetime" }: { value: Date | string | null | undefined; mode?: "datetime" | "date" | "time" }) {
  if (!value) return <>-</>;
  const d = new Date(value);
  const opts: Intl.DateTimeFormatOptions =
    mode === "date"
      ? { day: "2-digit", month: "short", year: "numeric" }
      : mode === "time"
        ? { hour: "2-digit", minute: "2-digit" }
        : { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" };
  // server renders in Istanbul time (the clan's zone); the browser then switches to the viewer's own zone
  return <ClientTime iso={d.toISOString()} server={dtf({ ...opts, timeZone: "Europe/Istanbul" }).format(d)} opts={opts} />;
}

function ClientTime({ iso, server, opts }: { iso: string; server: string; opts: Intl.DateTimeFormatOptions }) {
  const [text, setText] = useState(server);
  useEffect(() => setText(dtf(opts).format(new Date(iso))), [iso, opts]);
  return <time dateTime={iso}>{text}</time>;
}

function toLocalInput(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** datetime-local input that submits an ISO string (so the server never guesses the time zone). */
export function DateTimeInput({ name, defaultValue, required }: { name: string; defaultValue?: Date | string | null; required?: boolean }) {
  const [local, setLocal] = useState("");
  useEffect(() => {
    setLocal(defaultValue ? toLocalInput(new Date(defaultValue)) : "");
  }, [defaultValue]);
  const iso = local ? new Date(local).toISOString() : "";
  return (
    <>
      <input type="datetime-local" className="input" value={local} onChange={(e) => setLocal(e.target.value)} required={required} />
      <input type="hidden" name={name} value={iso} />
    </>
  );
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  const path = usePathname();
  const active = href === "/" ? path === "/" : path.startsWith(href);
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
        active ? "bg-gold/10 text-gold-2 ring-1 ring-gold/30" : "text-mute hover:bg-panel-2 hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

export function MobileMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  useEffect(() => setOpen(false), [path]);
  return (
    <div className="lg:hidden">
      <button className="btn-ghost btn-sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Menü
      </button>
      {open && <div className="absolute inset-x-0 top-16 z-40 border-b border-line bg-panel p-3">{children}</div>}
    </div>
  );
}

export function CopyButton({ text, label = "Özeti kopyala" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="btn-ghost"
      title="Discord'a yapıştırmak için"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? "Kopyalandı" : label}
    </button>
  );
}

/** "İşlem" button that opens its actions in a centered popup instead of a cramped dropdown */
export function ActionMenu({
  title,
  label = "İşlem",
  children,
  wide,
  buttonClassName = "btn-ghost btn-sm",
}: {
  title: ReactNode;
  label?: ReactNode;
  children: ReactNode;
  wide?: boolean;
  buttonClassName?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className={buttonClassName} onClick={() => ref.current?.showModal()}>
        {label}
      </button>
      <dialog
        ref={ref}
        className={`m-auto ${wide ? "w-[min(44rem,calc(100vw-2rem))]" : "w-[min(26rem,calc(100vw-2rem))]"} rounded-xl border border-line bg-panel-2 p-0 text-left text-ink shadow-2xl backdrop:bg-black/70`}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div className="font-semibold">{title}</div>
          <button type="button" className="btn-ghost btn-sm" onClick={() => ref.current?.close()} aria-label="Kapat">
            ✕
          </button>
        </div>
        <div className="max-h-[75vh] space-y-3 overflow-y-auto p-4">{children}</div>
      </dialog>
    </>
  );
}

/** Noah amount input: plain digits are shown with thousand dots while typing (10000000 -> 10.000.000); "15m" style still works */
export function NoahInput({ defaultValue = "", ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value" | "defaultValue"> & { defaultValue?: string }) {
  const [v, setV] = useState(defaultValue);
  return (
    <input
      {...rest}
      autoComplete="off"
      value={v}
      onChange={(e) => {
        const raw = e.target.value;
        if (/^[\d.]*$/.test(raw)) {
          const digits = raw.replace(/\./g, "").replace(/^0+(?=\d)/, "");
          setV(digits.replace(/\B(?=(\d{3})+(?!\d))/g, "."));
        } else setV(raw);
      }}
    />
  );
}
