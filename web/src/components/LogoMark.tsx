// The mark: a progress ring shaped like a C, with the checkpoint (a diamond) in its gap.
// `saving` sends the diamond once around the ring, the gesture of a game's autosave icon.
export function LogoMark({ size = 24, saving = false }: { size?: number; saving?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden focusable="false">
      <path
        d="M23.66 9.57A10 10 0 1 0 23.66 22.43"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <g className={saving ? 'origin-center animate-orbit' : undefined}>
        <path d="M27 12.2 30.8 16 27 19.8 23.2 16Z" fill="currentColor" />
      </g>
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="inline-flex items-center gap-2 text-accent">
      <LogoMark size={24} />
      <span className="font-display hidden text-lg font-extrabold text-text lowercase sm:inline">
        checkpoint
      </span>
    </span>
  );
}
