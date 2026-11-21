export function LogoMark({ size = 40, uid = "a" }: { size?: number; uid?: string }) {
  const g = `lg-gold-${uid}`;
  const r = `lg-red-${uid}`;
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id={g} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6d98a" />
          <stop offset="1" stopColor="#b8862c" />
        </linearGradient>
        <linearGradient id={r} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c8324a" />
          <stop offset="1" stopColor="#6e1322" />
        </linearGradient>
      </defs>
      {/* crossed swords */}
      <g stroke={`url(#${g})`} strokeWidth="3" strokeLinecap="round">
        <line x1="10" y1="8" x2="54" y2="56" />
        <line x1="54" y1="8" x2="10" y2="56" />
      </g>
      <g fill={`url(#${g})`}>
        <rect x="6" y="49" width="12" height="3" rx="1.5" transform="rotate(-42 12 50.5)" />
        <rect x="46" y="49" width="12" height="3" rx="1.5" transform="rotate(42 52 50.5)" />
      </g>
      {/* shield */}
      <path
        d="M32 10 L50 17 V31 C50 43 42 51 32 55 C22 51 14 43 14 31 V17 Z"
        fill={`url(#${r})`}
        stroke={`url(#${g})`}
        strokeWidth="2.5"
      />
      {/* S */}
      <path
        d="M39 23.5c-1.6-1.6-4-2.5-6.6-2.5-4 0-6.9 2.1-6.9 5.3 0 3.4 3 4.4 6.4 5.2 3.2.8 5.2 1.5 5.2 3.6 0 2-2 3.3-4.8 3.3-2.6 0-4.9-1-6.6-2.8"
        fill="none"
        stroke={`url(#${g})`}
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Logo({ uid = "nav" }: { uid?: string }) {
  return (
    <div className="flex items-center gap-3">
      <LogoMark size={40} uid={uid} />
      <div className="leading-tight">
        <div className="font-display text-lg font-bold tracking-[0.2em] text-gold">STUNNERS</div>
        <div className="text-[10px] tracking-[0.3em] text-mute uppercase">Clan Farm</div>
      </div>
    </div>
  );
}
