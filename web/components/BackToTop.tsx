"use client";

import { useEffect, useRef, useState } from "react";

const EVENT = "bs:elevator";
const FLOORS = 12;
type Phase = "idle" | "closing" | "riding" | "ding" | "opening";

// Elevator motion: gentle pull-away, cruise, then a soft stop.
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function chime() {
  try {
    const A = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new A();
    [1318.5, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = f;
      const t0 = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.05, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);
      o.connect(g).connect(ctx.destination);
      o.start(t0);
      o.stop(t0 + 1);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {}
}

/** Text link for the footer: calls the elevator instead of jumping. */
export function TopLink({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => window.dispatchEvent(new Event(EVENT))} className={className}>
      {children}
    </button>
  );
}

/** Floating elevator: doors close, the floor counter runs down while the page rides up, then a ding and the doors open. */
export default function BackToTop() {
  const [show, setShow] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [floor, setFloor] = useState(FLOORS);
  const [car, setCar] = useState(1); // car position in the shaft, 1 = bottom, 0 = top
  const busy = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
      if (!busy.current) {
        setShow(scrollY > 500);
        setFloor(Math.max(1, Math.round((scrollY / max) * FLOORS)));
      }
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    const call = () => ride();
    addEventListener(EVENT, call);
    return () => {
      removeEventListener("scroll", onScroll);
      removeEventListener(EVENT, call);
    };
  }, []);

  function ride() {
    if (busy.current) return;
    const from = scrollY;
    if (from < 2) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      scrollTo(0, 0);
      return;
    }
    busy.current = true;
    setShow(true);
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const startFloor = Math.max(1, Math.round((from / max) * FLOORS));
    const html = document.documentElement;
    const prevBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";
    setFloor(startFloor);
    setCar(from / max);
    setPhase("closing");
    const dur = Math.min(3000, 1500 + from * 0.12);
    setTimeout(() => {
      setPhase("riding");
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / dur);
        const k = ease(t);
        const y = from * (1 - k);
        scrollTo(0, y);
        setCar(y / max);
        setFloor(Math.max(0, Math.round(startFloor * (1 - k))));
        if (t < 1) requestAnimationFrame(step);
        else {
          setPhase("ding");
          chime();
          setTimeout(() => setPhase("opening"), 450);
          setTimeout(() => {
            html.style.scrollBehavior = prevBehavior;
            busy.current = false;
            setPhase("idle");
            setShow(false);
          }, 1700);
        }
      };
      requestAnimationFrame(step);
    }, 380);
  }

  const doorsShut = phase === "closing" || phase === "riding" || phase === "ding";
  const label = floor === 0 ? "TOP" : String(floor).padStart(2, "0");
  return (
    <>
      {/* the shaft: a rail on the right edge with the car travelling up it */}
      <div aria-hidden className={`pointer-events-none fixed right-1.5 top-4 bottom-4 z-50 w-1 rounded-full bg-slate-800/70 transition-opacity duration-300 ${phase === "riding" || phase === "ding" ? "opacity-100" : "opacity-0"}`}>
        <div className="absolute -left-1 h-6 w-3 rounded-sm bg-orange-400 shadow-[0_0_14px_rgba(251,146,60,0.9)]" style={{ top: `calc(${car * 100}% - ${car * 24}px)` }} />
      </div>

      <button
        type="button"
        onClick={ride}
        aria-label="Back to top"
        title="Back to top"
        className={`group fixed bottom-20 right-5 z-40 w-14 select-none overflow-hidden rounded-xl border border-slate-500/70 bg-gradient-to-b from-slate-700 to-slate-900 p-1 shadow-[0_10px_30px_-10px_rgba(0,0,0,0.9)] transition-all duration-500 hover:border-orange-400/80 ${
          show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
        } ${phase === "ding" ? "ring-2 ring-orange-400/80" : ""}`}
      >
        {/* floor indicator */}
        <span className="flex items-center justify-center gap-1 rounded-md bg-black/80 px-1 py-0.5 font-mono text-[11px] font-bold tracking-wider text-orange-400 [text-shadow:0_0_6px_rgba(251,146,60,0.9)]">
          <svg viewBox="0 0 10 10" className={`h-2 w-2 ${phase === "riding" ? "animate-pulse" : ""}`} aria-hidden>
            <path d="M5 1l4 6H1z" fill="currentColor" />
          </svg>
          {label}
        </span>
        {/* cab with doors */}
        <span className="relative mt-1 block h-11 overflow-hidden rounded-md bg-gradient-to-b from-amber-100/90 to-orange-200/70">
          <span className={`absolute inset-x-0 top-1 text-center font-mono text-[9px] font-bold text-orange-900/70 transition-opacity duration-300 ${phase === "opening" ? "opacity-100" : "opacity-0"}`}>DING</span>
          <span
            className={`absolute inset-y-0 left-0 w-1/2 border-r border-slate-900/60 bg-gradient-to-r from-slate-400 to-slate-300 transition-transform duration-[380ms] ease-in-out ${
              doorsShut ? "translate-x-0" : phase === "opening" ? "-translate-x-full" : "translate-x-0 group-hover:-translate-x-1"
            }`}
          />
          <span
            className={`absolute inset-y-0 right-0 w-1/2 border-l border-slate-900/60 bg-gradient-to-l from-slate-400 to-slate-300 transition-transform duration-[380ms] ease-in-out ${
              doorsShut ? "translate-x-0" : phase === "opening" ? "translate-x-full" : "translate-x-0 group-hover:translate-x-1"
            }`}
          />
          <svg viewBox="0 0 24 24" className={`absolute left-1/2 top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 text-slate-800 transition-opacity ${phase === "opening" ? "opacity-0" : "opacity-100"}`} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </span>
        <span className="mt-0.5 block text-center text-[9px] font-semibold uppercase tracking-wider text-slate-300">Top</span>
      </button>
    </>
  );
}
