"use client";

import { useEffect, useState } from "react";

/** "Explain this day": a three-sentence AI briefing on one day, built only from the site's data. */
export default function ExplainDay({ date, regionId, regionName }: { date: string; regionId: string; regionName: string }) {
  const [text, setText] = useState<string | null>(null);
  const [checked, setChecked] = useState<boolean | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setText(null);
  }, [date, regionId]);

  async function run() {
    setBusy(true);
    setText(null);
    const q = `Brief an emergency manager on fire activity on ${date} in ${regionName} (region id ${regionId}). Use day_detail. In 3 short sentences: how unusual the day was compared with the same days in other years, where it burned most, and how many fires only Suomi NPP saw.`;
    try {
      const r = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q, regionId, history: [{ role: "user", text: q }] }),
      });
      const raw = await r.text();
      let j: { answer?: string; error?: string; checked?: boolean } = {};
      try {
        j = JSON.parse(raw);
      } catch {
        j = { error: `Unexpected response (HTTP ${r.status}).` };
      }
      setText(j.answer ?? j.error ?? "No answer.");
      setChecked(j.checked);
    } catch (e) {
      setText(`Could not reach the assistant (${String(e).slice(0, 80)}).`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-3">
      <button onClick={run} disabled={busy} className="btn-ghost border-orange-400/50 py-1.5 text-sm">
        {busy ? "Gemini is reading the data…" : `✨ Explain ${date} with AI`}
      </button>
      {text ? (
        <div className="mt-2 rounded-xl border border-orange-400/30 bg-orange-500/5 p-3 text-sm leading-relaxed text-slate-200">
          {text}
          {checked !== undefined ? (
            <p className="mt-1 text-xs text-slate-500">{checked ? "✓ every number checked against the data" : "⚠ some numbers could not be checked"}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
