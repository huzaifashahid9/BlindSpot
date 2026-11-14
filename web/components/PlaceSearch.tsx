"use client";

import { useEffect, useRef, useState } from "react";

type Hit = { id?: string; name: string; address: string; lat?: number; lon?: number };
type Area = { id: string; name: string; level: string };

/** Bold the part of `text` the user typed. */
function Mark({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (!q || i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <b className="text-orange-300">{text.slice(i, i + q.length)}</b>
      {text.slice(i + q.length)}
    </>
  );
}

/**
 * Type-ahead search. Districts and provinces we have data for match instantly, offline;
 * any other village, town or landmark comes from Google and becomes a 15 km custom area.
 */
export default function PlaceSearch({
  areas = [],
  onRegion,
  onPick,
}: {
  areas?: Area[];
  onRegion?: (id: string) => void;
  onPick: (h: { name: string; lat: number; lon: number }) => void;
}) {
  const [google, setGoogle] = useState(false);
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/places")
      .then((r) => r.json())
      .then((j) => setGoogle(Boolean(j.configured)))
      .catch(() => setGoogle(false));
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const term = q.trim();
  const low = term.toLowerCase();
  const local =
    term.length >= 1
      ? areas
          .filter((a) => a.name.toLowerCase().includes(low))
          .sort((a, b) => Number(!a.name.toLowerCase().startsWith(low)) - Number(!b.name.toLowerCase().startsWith(low)) || a.name.localeCompare(b.name))
          .slice(0, 4)
      : [];

  useEffect(() => {
    setSel(0);
    if (!google || term.length < 2) {
      setHits([]);
      setMsg(null);
      return;
    }
    let live = true;
    const id = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(term)}`);
        const j = await r.json();
        if (!live) return;
        if (!r.ok) {
          setHits([]);
          setMsg(j.error ?? "Search failed. Try again.");
        } else {
          setHits(j.results);
          setMsg(null);
        }
      } catch {
        if (live) setMsg("Search failed. Try again.");
      } finally {
        if (live) setBusy(false);
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(id);
    };
  }, [term, google]);

  const items: ({ kind: "area"; a: Area } | { kind: "place"; h: Hit })[] = [...local.map((a) => ({ kind: "area" as const, a })), ...hits.map((h) => ({ kind: "place" as const, h }))];

  async function choose(i: number) {
    const it = items[i];
    if (!it) return;
    setOpen(false);
    if (it.kind === "area") {
      setQ(it.a.name);
      onRegion?.(it.a.id);
      return;
    }
    const h = it.h;
    setQ(h.name);
    if (h.lat != null && h.lon != null) return onPick({ name: h.name, lat: h.lat, lon: h.lon });
    setBusy(true);
    try {
      const r = await fetch(`/api/places?id=${encodeURIComponent(h.id ?? "")}`);
      const j = await r.json();
      if (!r.ok) {
        setMsg(j.error ?? "Could not locate that place.");
        setOpen(true);
      } else onPick({ name: h.name, lat: j.result.lat, lon: j.result.lon });
    } catch {
      setMsg("Could not locate that place.");
      setOpen(true);
    } finally {
      setBusy(false);
    }
  }

  if (!google && !areas.length) return null;
  const empty = term.length >= 2 && !busy && !items.length && !msg;
  return (
    <div ref={box} className="relative w-60">
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
        <circle cx={11} cy={11} r={7} />
        <path d="M20 20l-4-4" />
      </svg>
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setSel((s) => Math.min(items.length - 1, s + 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setSel((s) => Math.max(0, s - 1));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(sel);
          } else if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search any city, town or village"
        aria-label="Search a place in Pakistan"
        role="combobox"
        aria-controls="place-search-list"
        aria-expanded={open}
        aria-autocomplete="list"
        className="w-full rounded-lg border border-slate-600 bg-slate-900 py-1.5 pl-8 pr-7 text-sm text-white outline-none transition placeholder:text-slate-500 focus:border-orange-400"
      />
      {busy ? <span className="absolute right-2 top-2.5 h-3 w-3 animate-spin rounded-full border-2 border-orange-400 border-t-transparent" /> : null}
      {open && term.length >= 1 && (items.length || msg || empty || busy) ? (
        <ul id="place-search-list" role="listbox" className="absolute left-0 top-full z-50 mt-1 max-h-96 w-80 overflow-auto rounded-xl border border-slate-700 bg-slate-950/95 shadow-2xl backdrop-blur [animation:fade-up_0.2s_ease_both]">
          {items.map((it, i) => {
            const on = i === sel;
            const head = it.kind === "area" && i === 0 ? "Districts with full history" : it.kind === "place" && (i === 0 || items[i - 1].kind === "area") ? "Places" : null;
            return (
              <li key={it.kind === "area" ? it.a.id : it.h.id ?? `${it.h.name}${it.h.address}`} role="option" aria-selected={on}>
                {head ? <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{head}</p> : null}
                <button
                  onMouseEnter={() => setSel(i)}
                  onClick={() => choose(i)}
                  className={`flex w-full items-center gap-2.5 px-3 py-2 text-left ${on ? "bg-slate-800" : ""}`}
                >
                  {it.kind === "area" ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-orange-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
                      <path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" />
                      <path d="M9 3v15M15 6v15" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-sky-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden>
                      <path d="M12 21s-7-6.1-7-11a7 7 0 0114 0c0 4.9-7 11-7 11z" />
                      <circle cx={12} cy={10} r={2.5} />
                    </svg>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-white">
                      <Mark text={it.kind === "area" ? it.a.name : it.h.name} q={term} />
                    </span>
                    <span className="block truncate text-xs text-slate-500">
                      {it.kind === "area" ? (it.a.level === "province" ? "Province" : "District") + " · precomputed since 2000" : it.h.address}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {busy && !hits.length ? <li className="shimmer mx-3 my-2 h-8 rounded-md bg-slate-800/60" /> : null}
          {msg ? <li className="px-3 py-2 text-xs text-rose-300">{msg}</li> : null}
          {empty ? <li className="px-3 py-2 text-xs text-slate-400">No place in Pakistan matches that yet. Keep typing.</li> : null}
          <li className="border-t border-slate-800 px-3 py-1.5 text-[10px] text-slate-500">
            {google ? "A place becomes a 15 km circle around it. Places by Google." : "Matching districts and provinces."}
          </li>
        </ul>
      ) : null}
    </div>
  );
}
