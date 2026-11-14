"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const GLOSSARY: Record<string, string> = {
  harmonized:
    "Made comparable. Different satellites count fires differently, so we adjust every year to one common scale. That way more fires on the chart means more fire, not just more satellites.",
  "suomi npp":
    "A NASA weather satellite that spotted fires twice a day. It stopped sending fire data on 2 November 2026.",
  modis:
    "The fire camera on NASA's two older satellites, Terra and Aqua, flying since 2000 and 2002. It sees bigger fires.",
  viirs:
    "The newer, sharper fire camera on Suomi NPP, NOAA-20 and NOAA-21. It can see much smaller fires.",
  frp: "Fire Radiative Power: how much heat a fire gives off, in megawatts. A rough measure of how big or hot a fire is.",
  "unusual day":
    "A day with clearly more fires than that same time of year normally has in this area.",
  "trust score":
    "0 to 100: how much you can rely on the numbers for this district. It checks if satellites agree, how often they pass, and how much data there is.",
  "fire event":
    "One fire on one day. If three satellites spot the same fire, we count it once, not three times.",
  "only suomi npp":
    "Fires that Suomi NPP spotted and no other satellite did. Now that it has stopped, fires like these go unrecorded.",
};

/** A word with a dotted underline; tap or hover it for a one-line meaning. */
export default function Term({
  k,
  children,
}: {
  k: keyof typeof GLOSSARY | string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const text = GLOSSARY[k.toLowerCase()];
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (!open || !ref.current) return setPos(null);
    const place = () => {
      const r = ref.current!.getBoundingClientRect();
      setPos({
        x: Math.max(8, Math.min(r.left, innerWidth - 272)),
        y: r.bottom + 6,
      });
    };
    place();
    addEventListener("scroll", place, { passive: true });
    return () => removeEventListener("scroll", place);
  }, [open]);
  if (!text) return <>{children}</>;
  return (
    <span
      ref={ref}
      className="relative inline"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="cursor-help border-b border-dotted border-current/60 text-inherit [font:inherit] [letter-spacing:inherit] [text-transform:inherit]"
        aria-expanded={open}
      >
        {children}
      </button>
      {open && pos
        ? createPortal(
            <span
              role="tooltip"
              style={{ left: pos.x, top: pos.y }}
              className="pointer-events-none fixed z-[70] block w-64 rounded-lg border border-slate-700 bg-slate-950 p-2.5 text-left font-sans text-xs font-normal normal-case leading-relaxed tracking-normal text-slate-200 shadow-2xl [animation:fade-up_0.2s_ease_both]"
            >
              {text}
            </span>,
            document.body,
          )
        : null}
    </span>
  );
}
