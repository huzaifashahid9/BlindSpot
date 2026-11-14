"use client";

import { useEffect, useRef, useState } from "react";

type Hit = { name: string; address: string; lat: number; lon: number };

/** Type any village, town or landmark; picking one makes it the custom area. Hidden if the server has no key. */
export default function PlaceSearch({ onPick }: { onPick: (h: Hit) => void }) {
  const [on, setOn] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/places")
      .then((r) => r.json())
      .then((j) => setOn(Boolean(j.configured)))
      .catch(() => setOn(false));
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  useEffect(() => {
    if (q.trim().length < 3) {
      setHits([]);
      setMsg(null);
      return;
    }
    const id = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(q.trim())}`);
        const j = await r.json();
        if (!r.ok) {
          setHits([]);
          setMsg(j.error ?? `Search failed (${r.status})`);
        } else {
          setHits(j.results);
          setMsg(j.results.length ? null : "No place in Pakistan by that name.");
        }
        setOpen(true);
      } catch {
        setMsg("Search failed. Try again.");
      } finally {
        setBusy(false);
      }
    }, 350);
    return () => clearTimeout(id);
  }, [q]);

  if (!on) return null;
  return (
    <div ref={box} className="relative w-56">
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
        <circle cx={11} cy={11} r={7} />
        <path d="M20 20l-4-4" />
      </svg>
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => hits.length && setOpen(true)}
        placeholder="Search a village or town"
        aria-label="Search a place in Pakistan"
        className="w-full rounded-lg border border-slate-600 bg-slate-900 py-1.5 pl-8 pr-2 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-orange-400"
      />
      {busy ? <span className="absolute right-2 top-2.5 h-3 w-3 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" /> : null}
      {open && (hits.length || msg) ? (
        <ul className="absolute left-0 top-full z-50 mt-1 w-80 overflow-hidden rounded-xl border border-slate-700 bg-slate-950/95 shadow-2xl backdrop-blur [animation:fade-up_0.25s_ease_both]">
          {hits.map((h) => (
            <li key={`${h.lat},${h.lon}`}>
              <button
                onClick={() => {
                  onPick(h);
                  setOpen(false);
                  setQ(h.name);
                }}
                className="block w-full px-3 py-2 text-left hover:bg-slate-800"
              >
                <span className="block text-sm text-white">{h.name}</span>
                <span className="block truncate text-xs text-slate-500">{h.address}</span>
              </button>
            </li>
          ))}
          {msg ? <li className="px-3 py-2 text-xs text-slate-400">{msg}</li> : null}
          <li className="border-t border-slate-800 px-3 py-1.5 text-[10px] text-slate-500">Picking a place analyses a 15 km circle around it. Search by Google.</li>
        </ul>
      ) : null}
    </div>
  );
}
