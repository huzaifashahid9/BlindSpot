"use client";

import { useEffect, useState } from "react";

const KEY = "bs-welcome-seen";
export const WELCOME_EVENT = "bs:welcome";

function Art({ n }: { n: number }) {
  // simple drawings, one per slide
  const fires = [
    [120, 120], [140, 110], [150, 132], [170, 118], [132, 142], [160, 150], [182, 138], [110, 100], [195, 125],
  ];
  if (n === 0)
    return (
      <svg viewBox="0 0 300 180" className="h-full w-full" aria-hidden>
        <path d="M60 165 C 90 120, 100 60, 150 40 S 240 70, 250 165 Z" fill="#0f172a" stroke="#334155" />
        {fires.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={4} fill="#fb923c" className="pulse-dot" style={{ animationDelay: `${i * 0.2}s` }} />
        ))}
        <g className="welcome-orbit">
          <rect x={30} y={18} width={22} height={12} rx={2} fill="#cbd5e1" />
          <rect x={14} y={21} width={14} height={6} fill="#38bdf8" />
          <rect x={54} y={21} width={14} height={6} fill="#38bdf8" />
          <path d="M41 30 L 20 165 L 90 165 Z" fill="#38bdf8" opacity={0.12} />
        </g>
      </svg>
    );
  if (n === 1)
    return (
      <svg viewBox="0 0 300 180" className="h-full w-full" aria-hidden>
        {["#38bdf8", "#a78bfa", "#fbbf24", "#34d399", "#f43f5e"].map((c, i) => (
          <g key={c}>
            <circle cx={40} cy={20 + i * 35} r={9} fill={c} />
            <path d={`M52 ${20 + i * 35} C 130 ${20 + i * 35}, 140 90, 210 90`} fill="none" stroke={c} strokeWidth={2.5} className="draw" style={{ animationDelay: `${i * 0.15}s` }} />
          </g>
        ))}
        <rect x={210} y={70} width={70} height={40} rx={8} fill="#f97316" />
        <text x={245} y={95} textAnchor="middle" fontSize={13} fontWeight={700} fill="#0b0b0b">
          1 record
        </text>
      </svg>
    );
  if (n === 2)
    return (
      <svg viewBox="0 0 300 180" className="h-full w-full" aria-hidden>
        <path d="M60 165 C 90 120, 100 60, 150 40 S 240 70, 250 165 Z" fill="#0f172a" stroke="#334155" />
        {fires.map(([x, y], i) =>
          i % 4 === 1 ? (
            <circle key={i} cx={x} cy={y} r={5} fill="none" stroke="#f43f5e" strokeDasharray="2 2" />
          ) : (
            <circle key={i} cx={x} cy={y} r={4} fill="#fb923c" />
          ),
        )}
        <g transform="translate(240 30)">
          <rect x={0} y={0} width={22} height={12} rx={2} fill="#475569" />
          <rect x={-16} y={3} width={14} height={6} fill="#334155" />
          <rect x={24} y={3} width={14} height={6} fill="#334155" />
          <path d="M-6 -6 L 30 20 M30 -6 L -6 20" stroke="#f43f5e" strokeWidth={3} strokeLinecap="round" />
        </g>
        <text x={150} y={178} textAnchor="middle" fontSize={11} fill="#fda4af">
          dashed = fires we now miss
        </text>
      </svg>
    );
  return (
    <svg viewBox="0 0 300 180" className="h-full w-full" aria-hidden>
      <rect x={20} y={20} width={260} height={30} rx={8} fill="#0f172a" stroke="#334155" />
      <rect x={30} y={27} width={70} height={16} rx={4} fill="#1e293b" />
      <text x={36} y={39} fontSize={10} fill="#cbd5e1">Lahore</text>
      <rect x={110} y={27} width={60} height={16} rx={4} fill="#f97316" />
      <rect x={176} y={27} width={50} height={16} rx={4} fill="#1e293b" />
      {Array.from({ length: 7 * 6 }, (_, i) => (
        <rect key={i} x={40 + (i % 14) * 16} y={70 + Math.floor(i / 14) * 16} width={13} height={13} rx={2} fill={["#1e293b", "#7c2d12", "#ea580c", "#fb923c"][(i * 7) % 4]} />
      ))}
      <path d="M150 160 l 0 -14 l 10 10 l -5 0 l 4 7 l -3 1 l -4 -7 l -4 4 z" fill="#fff" />
    </svg>
  );
}

const SLIDES = [
  {
    title: "Satellites watch Pakistan for fires, every day",
    body: "Every autumn and spring, farmers burn leftover crop stubble. That smoke is a big part of the smog over Lahore and Punjab. NASA satellites fly over and spot these fires from space as small hot dots.",
  },
  {
    title: "Five satellites, one fair record",
    body: "Five satellites do this job, but each one sees differently. Newer ones spot smaller fires, so their numbers do not match. BlindSpot joins all of them into one record you can compare fairly, year by year, back to 2000.",
  },
  {
    title: "One satellite just went dark",
    body: "On 2 November 2026 one of them, Suomi NPP, stopped. About 1 in 4 fires it saw, no other satellite saw. BlindSpot shows exactly which fires we will now miss, and where in Pakistan the gap is worst.",
  },
  {
    title: "How to use it",
    body: "Pick a district or type any town in the search box at the top. Everything on the page then follows that place. Use the tabs to explore. Words with a dotted underline explain themselves when you tap them.",
  },
];

/** A short plain-language welcome for first-time visitors. Opens once; "What is this?" brings it back. */
export default function Welcome({ onTour }: { onTour: () => void }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) === "1";
    } catch {}
    const t = seen ? undefined : setTimeout(() => setOpen(true), 900);
    const re = () => {
      setI(0);
      setOpen(true);
    };
    addEventListener(WELCOME_EVENT, re);
    return () => {
      if (t) clearTimeout(t);
      removeEventListener(WELCOME_EVENT, re);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowRight") setI((x) => Math.min(SLIDES.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [open]);

  function close() {
    setOpen(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  }

  if (!open) return null;
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm [animation:fade-up_0.3s_ease_both]" onClick={close}>
      <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="ring relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <button onClick={close} aria-label="Close" className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
        <div key={`a${i}`} className="h-44 bg-gradient-to-b from-slate-900 to-slate-950 px-6 pt-4 [animation:fade-up_0.4s_ease_both]">
          <Art n={i} />
        </div>
        <div key={`t${i}`} className="px-6 pb-2 pt-4 [animation:fade-up_0.4s_ease_both]">
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-400">
            {i === 0 ? "Welcome to BlindSpot" : `Step ${i + 1} of ${SLIDES.length}`}
          </p>
          <h2 id="welcome-title" className="mt-1 font-display text-2xl font-semibold text-white">
            {s.title}
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-300">{s.body}</p>
        </div>
        <div className="flex flex-col items-stretch gap-3 px-6 pb-5 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-1.5">
            {SLIDES.map((_, k) => (
              <button key={k} onClick={() => setI(k)} aria-label={`Step ${k + 1}`} className={`h-2 rounded-full transition-all ${k === i ? "w-6 bg-orange-400" : "w-2 bg-slate-700 hover:bg-slate-500"}`} />
            ))}
          </div>
          <div className="flex justify-end gap-2 whitespace-nowrap">
            {i > 0 ? (
              <button onClick={() => setI(i - 1)} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
                Back
              </button>
            ) : (
              <button onClick={close} className="rounded-lg px-3 py-2 text-sm text-slate-400 hover:text-white">
                Skip
              </button>
            )}
            {last ? (
              <>
                <button onClick={close} className="rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">
                  Explore myself
                </button>
                <button
                  onClick={() => {
                    close();
                    onTour();
                  }}
                  className="rounded-lg bg-orange-500 px-3 py-2 text-sm font-semibold text-black hover:bg-orange-400"
                >
                  Take the tour
                </button>
              </>
            ) : (
              <button onClick={() => setI(i + 1)} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black hover:bg-orange-400">
                Next
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
