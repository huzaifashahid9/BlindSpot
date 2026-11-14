/** BlindSpot mark: an eye with a fire for a pupil and a gap in its rim, the blind spot. The dot is the satellite. */
export function LogoMark({ className = "h-7 w-7", bg = true }: { className?: string; bg?: boolean }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="bs-lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fbbf24" />
          <stop offset="0.55" stopColor="#f97316" />
          <stop offset="1" stopColor="#f43f5e" />
        </linearGradient>
        <linearGradient id="bs-lf" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#f43f5e" />
          <stop offset="0.6" stopColor="#f97316" />
          <stop offset="1" stopColor="#fde68a" />
        </linearGradient>
      </defs>
      {bg ? <rect width="64" height="64" rx="15" fill="#0a0e18" stroke="#1f2937" /> : null}
      <path d="M5 33 C 16 16, 48 16, 59 33 C 48 50, 16 50, 5 33 Z" fill="none" stroke="url(#bs-lg)" strokeWidth="5" strokeLinejoin="round" />
      <path
        d="M32 20 C 38 26.5, 42 30.5, 42 36 A 10 10 0 0 1 22 36 C 22 32, 25 29.5, 26.5 26 C 27.8 29, 29.5 30.2, 30.8 30.2 C 30.2 26.8, 30.8 23, 32 20 Z"
        fill="url(#bs-lf)"
        className="logo-flame"
      />
      <path d="M41 15 L 50 28" stroke={bg ? "#0a0e18" : "#05070d"} strokeWidth="5" />
      <circle cx="52" cy="12" r="4" fill="#38bdf8" className="logo-sat" />
    </svg>
  );
}

export default function Logo({ size = "text-lg", mark = "h-7 w-7" }: { size?: string; mark?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-bold tracking-tight text-white ${size}`}>
      <LogoMark className={mark} />
      <span>
        Blind<span className="text-orange-400">Spot</span>
      </span>
    </span>
  );
}
