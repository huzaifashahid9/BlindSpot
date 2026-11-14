"use client";

import { useState } from "react";
import Icon from "@/components/Icon";

/** Copy link and share buttons for a scorecard. */
export default function ShareCard({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const url = () => (typeof window === "undefined" ? "" : window.location.href);
  const enc = (s: string) => encodeURIComponent(s);
  const btn = "inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-200 hover:border-orange-400 hover:text-white";
  return (
    <div className="flex flex-wrap gap-2">
      <button
        className={`${btn} border-orange-400/60 bg-orange-500/10`}
        onClick={async () => {
          const u = url();
          if (navigator.share) {
            try {
              await navigator.share({ title: "BlindSpot scorecard", text, url: u });
              return;
            } catch {
              /* cancelled: fall back to copying */
            }
          }
          await navigator.clipboard?.writeText(u);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
      >
        <Icon name={copied ? "check" : "link"} /> {copied ? "Link copied" : "Share this scorecard"}
      </button>
      <a className={btn} target="_blank" rel="noopener noreferrer" href={`https://wa.me/?text=${enc(text + " ")}`} onClick={(e) => (e.currentTarget.href = `https://wa.me/?text=${enc(`${text} ${url()}`)}`)}>
        WhatsApp
      </a>
      <a
        className={btn}
        target="_blank"
        rel="noopener noreferrer"
        href="https://twitter.com/intent/tweet"
        onClick={(e) => (e.currentTarget.href = `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url())}`)}
      >
        X
      </a>
    </div>
  );
}
