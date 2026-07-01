export function LogoMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`obsidra-logo ${compact ? "obsidra-logo-compact" : ""}`} aria-label="Obsidra logo">
      <img src="/obsidra-logo.png" alt="Obsidra TradeBot" loading="eager" decoding="async" />
    </div>
  );
}
