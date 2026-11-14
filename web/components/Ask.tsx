"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

type Msg = { role: "user" | "assistant"; text: string; checked?: boolean; tools?: string[] };

const EXAMPLES = [
  "Which district burned the most in November 2025?",
  "How much of Pakistan's fire record did we lose when Suomi NPP stopped?",
  "When was the rice-residue burning season in Sheikhupura in 2025, and how did it compare with 2024?",
  "Which Punjab districts lose the most fires without Suomi NPP?",
];

export default function Ask({ regionId }: { regionId: string }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: Msg[] = [...msgs, { role: "user", text }];
    setMsgs(next);
    setQ("");
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, regionId, history: next.slice(-6).map((m) => ({ role: m.role, text: m.text })) }),
      });
      const raw = await res.text();
      let data: { answer?: string; error?: string; detail?: string; checked?: boolean; tools?: string[] } = {};
      try {
        data = JSON.parse(raw);
      } catch {
        data = { error: `The assistant returned an unexpected response (HTTP ${res.status}).`, detail: raw.slice(0, 160) };
      }
      const reply = data.answer ?? data.error ?? "No answer.";
      setMsgs([...next, { role: "assistant", text: reply || "No answer.", checked: data.checked, tools: data.tools }]);
    } catch (e) {
      setMsgs([...next, { role: "assistant", text: `Could not reach the assistant (${String(e).slice(0, 120)}). Try again in a moment.` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-slate-400">
        BlindSpot AI answers from this site&apos;s own NASA data, looking every figure up with its own data tools. Every number in a reply is checked against the data
        the tools returned before you see it. Ask in English or Urdu.
      </p>
      <div className="mt-4 space-y-3">
        {msgs.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button key={e} onClick={() => send(e)} className="rounded-full border border-slate-700 px-3 py-1.5 text-left text-sm text-slate-300 hover:bg-slate-800">
                {e}
              </button>
            ))}
          </div>
        ) : null}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "ml-10 rounded-lg bg-slate-800 p-3 text-slate-100" : "mr-10 rounded-lg border border-slate-800 bg-slate-900 p-3 text-slate-200"}>
            <p className="whitespace-pre-wrap text-sm leading-relaxed" dir="auto">
              {m.text}
            </p>
            {m.role === "assistant" && m.tools?.length ? (
              <p className="mt-2 text-xs text-slate-500">
                {m.checked ? <><Icon name="check" className="h-3.5 w-3.5 text-emerald-400" /> every number checked against the data</> : <><Icon name="alert" className="h-3.5 w-3.5 text-amber-400" /> some numbers could not be checked</>} · tools used: {m.tools.join(", ")}
              </p>
            ) : null}
          </div>
        ))}
        {busy ? <p className="text-sm text-slate-400">Looking it up in the data…</p> : null}
      </div>
      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(q);
        }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          dir="auto"
          placeholder="Ask about fires, seasons, districts or the lost satellite…"
          className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white placeholder:text-slate-500"
        />
        <button disabled={busy} className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-black disabled:opacity-50">
          Ask
        </button>
      </form>
    </div>
  );
}
