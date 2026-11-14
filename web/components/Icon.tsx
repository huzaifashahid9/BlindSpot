// Small stroke icons drawn in SVG, so the site never depends on emoji or symbol glyphs.
const PATHS: Record<string, string> = {
  link: "M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1",
  check: "M5 12l5 5 9-10",
  alert: "M12 4l9 16H3zM12 10v4M12 17v.5",
  download: "M12 4v11M7 10l5 5 5-5M5 20h14",
  back: "M15 5l-7 7 7 7",
  close: "M6 6l12 12M18 6L6 18",
  play: "M8 5v14l11-7z",
  pause: "M8 5v14M16 5v14",
  down: "M12 5v14M6 13l6 6 6-6",
  spark: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6",
  dot: "M12 12m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0",
  arrow: "M5 12h14M13 6l6 6-6 6",
  info: "M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18M12 11v6M12 7.5v.5",
};

export default function Icon({ name, className = "h-4 w-4", fill = false }: { name: keyof typeof PATHS | string; className?: string; fill?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`inline-block shrink-0 align-[-0.15em] ${className}`} fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}
