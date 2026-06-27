export function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`obsidra-logo ${compact ? "obsidra-logo-compact" : ""}`} aria-label="Obsidra logo">
      <svg viewBox="0 0 64 64" role="img">
        <defs>
          <linearGradient id="obsidraLogoGradient" x1="10" x2="56" y1="8" y2="58" gradientUnits="userSpaceOnUse">
            <stop stopColor="#50e3c2" />
            <stop offset="0.55" stopColor="#7c5cff" />
            <stop offset="1" stopColor="#fbbf24" />
          </linearGradient>
        </defs>
        <path d="M32 6 55 19.5v25L32 58 9 44.5v-25L32 6Z" fill="rgba(5,7,13,.78)" stroke="url(#obsidraLogoGradient)" strokeWidth="2.4" />
        <path d="M21 39.5 29 25l7 9 7-14" fill="none" stroke="#50e3c2" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3.4" />
        <path d="M23 45h18" stroke="rgba(255,255,255,.5)" strokeLinecap="round" strokeWidth="2" />
        <circle cx="32" cy="32" r="20" fill="none" stroke="rgba(80,227,194,.13)" strokeWidth="8" />
      </svg>
    </div>
  );
}
