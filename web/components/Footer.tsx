import Link from "next/link";
import BackToTop from "@/components/BackToTop";
import Logo from "@/components/Logo";

const REPO = "https://github.com/huzaifashahid9/BlindSpot";
const TEAM = [
  { name: "Muneeb Mustafa", gh: "tf-muneeb" },
  { name: "Huzaifa Shahid", gh: "huzaifashahid9" },
  { name: "Ashar Raza", gh: "SyedAsharRaza" },
];
const EXPLORE = [
  ["#live", "Live now"],
  ["#calendar", "Burning calendar"],
  ["#history", "Fire history"],
  ["#lost", "Lost Eyes"],
  ["#sim", "Simulator"],
  ["#clock", "Blind Clock"],
  ["#area", "Area and export"],
  ["#ask", "BlindSpot AI"],
];
const DATA = [
  ["https://firms.modaps.eosdis.nasa.gov/", "NASA FIRMS", "MODIS C6.1 and VIIRS 375 m active fire"],
  ["https://earthdata.nasa.gov/gibs", "NASA GIBS", "satellite imagery and night lights"],
  ["https://www.geoboundaries.org/", "geoBoundaries", "district boundaries, CC BY 4.0"],
  ["https://ai.google.dev/", "Google Gemini", "engine behind BlindSpot AI"],
  ["https://developers.google.com/maps", "Google Maps Platform", "basemaps and place search"],
];

function GitHubMark({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

export default function Footer() {
  return (
    <footer className="relative mt-24 border-t border-slate-800/80 pb-28 pt-12">
      <div className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-orange-500/60 to-transparent" />
      <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1.3fr_1.1fr]">
        <div>
          <Logo size="text-2xl" mark="h-9 w-9" />
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
            One consistent fire record from five satellites for every district of Pakistan, and a measure of what the record lost when Suomi NPP went
            dark.
          </p>
          <div className="mt-5 inline-flex flex-col gap-1 rounded-xl border border-slate-800 bg-slate-900/60 px-4 py-3">
            <span className="hud-label text-orange-300">NASA Space Apps Challenge 2026</span>
            <span className="text-sm text-slate-300">Harmonization of MODIS and VIIRS Hot Spots</span>
          </div>
        </div>

        <nav aria-label="Explore">
          <p className="hud-label">Explore</p>
          <ul className="mt-3 space-y-2 text-sm">
            {EXPLORE.map(([href, label]) => (
              <li key={href}>
                <a href={href} className="text-slate-400 transition hover:text-orange-300">
                  {label}
                </a>
              </li>
            ))}
            <li>
              <Link href="/method" className="text-slate-400 transition hover:text-orange-300">
                Method and validation
              </Link>
            </li>
          </ul>
        </nav>

        <div>
          <p className="hud-label">Data and tools</p>
          <ul className="mt-3 space-y-2.5 text-sm">
            {DATA.map(([href, name, what]) => (
              <li key={name}>
                <a href={href} target="_blank" rel="noopener noreferrer" className="text-slate-300 transition hover:text-orange-300">
                  {name}
                </a>
                <span className="block text-xs text-slate-500">{what}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="hud-label">Built by Team Hexabytes</p>
          <ul className="mt-3 space-y-2">
            {TEAM.map((t) => (
              <li key={t.gh}>
                <a
                  href={`https://github.com/${t.gh}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-2 transition hover:-translate-y-0.5 hover:border-orange-400/50"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-rose-500 font-display text-xs font-bold text-black">
                    {t.name
                      .split(" ")
                      .map((w) => w[0])
                      .join("")}
                  </span>
                  <span>
                    <span className="block text-sm font-medium text-white">{t.name}</span>
                    <span className="block text-xs text-slate-500 group-hover:text-orange-300">github.com/{t.gh}</span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <a
            href={REPO}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-200 transition hover:border-orange-400/60 hover:text-white"
          >
            <GitHubMark /> Source code on GitHub
          </a>
        </div>
      </div>

      <div className="mt-12 flex flex-col gap-3 border-t border-slate-800/80 pt-6 text-xs text-slate-500 md:flex-row md:items-center md:justify-between">
        <p>© 2026 Team Hexabytes. Fire data courtesy of NASA FIRMS. BlindSpot is a Space Apps project and is not endorsed by NASA. Code, logo and Ask BlindSpot AI are SI-assisted (<Link href="/method" className="underline hover:text-orange-300">details</Link>).</p>
      </div>
      <BackToTop />
    </footer>
  );
}
