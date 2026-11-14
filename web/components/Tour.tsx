"use client";

import { useEffect, useState } from "react";
import Icon from "@/components/Icon";

export type TourStep = { tab: string; target?: string; title: string; text: string };
const STEP_MS = 9000;

/** A guided, self-advancing walk through the findings: built for a judge with one minute. */
export default function Tour({ steps, onStep, onClose }: { steps: TourStep[]; onStep: (s: TourStep) => void; onClose: () => void }) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const s = steps[i];

  useEffect(() => {
    onStep(s);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);
  useEffect(() => {
    if (paused) return;
    const id = setTimeout(() => (i < steps.length - 1 ? setI(i + 1) : onClose()), STEP_MS);
    return () => clearTimeout(id);
  }, [i, paused, steps.length, onClose]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => Math.min(steps.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [steps.length, onClose]);

  return (
    <div className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4" role="dialog" aria-label="Guided tour">
      <div className="ring w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-950/95 shadow-[0_30px_80px_-20px_rgba(249,115,22,0.6)] backdrop-blur">
        <div className="flex gap-1 px-4 pt-3">
          {steps.map((_, k) => (
            <div key={k} className="h-1 flex-1 overflow-hidden rounded bg-slate-800">
              {k < i ? <div className="h-full bg-orange-400" /> : null}
              {k === i ? (
                <div
                  key={`${i}-${paused}`}
                  className="h-full origin-left bg-orange-400"
                  style={{ animation: paused ? "none" : `progress ${STEP_MS}ms linear both`, transform: paused ? "scaleX(0.5)" : undefined }}
                />
              ) : null}
            </div>
          ))}
        </div>
        <div key={i} className="tab-enter p-4">
          <div>
            <p className="hud-label text-orange-300">
              Guided tour · {i + 1} of {steps.length}
            </p>
            <p className="mt-1 font-display text-xl font-semibold text-white">{s.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">{s.text}</p>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 px-4 py-2 text-xs">
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <Icon name="close" className="h-3.5 w-3.5" /> End tour
          </button>
          <div className="flex items-center gap-2">
            <button onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0} className="rounded border border-slate-700 px-2 py-1 text-slate-300 disabled:opacity-40">
              <Icon name="back" className="h-3.5 w-3.5" /> Back
            </button>
            <button onClick={() => setPaused(!paused)} className="rounded border border-slate-700 px-2 py-1 text-slate-300">
              {paused ? <><Icon name="play" className="h-3 w-3" fill /> Resume</> : <><Icon name="pause" className="h-3 w-3" /> Pause</>}
            </button>
            <button
              onClick={() => (i < steps.length - 1 ? setI(i + 1) : onClose())}
              className="rounded bg-orange-500 px-2 py-1 font-semibold text-black"
            >
              {i < steps.length - 1 ? "Next" : "Finish"} <Icon name="arrow" className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
