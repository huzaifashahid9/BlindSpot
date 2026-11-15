# BlindSpot

**One fire record from two satellite families, and an honest map of what it misses.**

NASA Space Apps Challenge 2026 · *Harmonization of MODIS and VIIRS Hot Spots* · Team Hexabytes · Pakistan

**Live site:** https://blindspot-web-nine.vercel.app (free, no login)

On 2 November 2026 NASA stopped Suomi NPP fire data. BlindSpot fuses MODIS (Terra, Aqua) and VIIRS 375 m (Suomi NPP, NOAA-20, NOAA-21) detections into one harmonized record of fire events for Pakistan, then shows what that record lost: **23.3% of Pakistan's fire events from Nov 2023 to Nov 2026 (67,288 fires) were seen only by Suomi NPP**, up to 28% in Faisalabad and Toba Tek Singh.

## What's on the site

| Screen | What it shows |
| --- | --- |
| Burning calendar | One square per day of harmonized fire events for Pakistan, a province or any of 126 districts. Unusual days, critical burning weeks, wheat and rice burning seasons, and a click-through map of each day with NASA GIBS imagery. |
| Lost Eyes | Share of events seen only by each satellite, month by month, by fire size, and the districts that lose the most. |
| Failure simulator | Switch any of the five satellites off and recount, in the browser, which fire events and unusual days would vanish from the record, mapped and ranked by district. |
| Season race | Each burning season's running total of fire events raced day by day against earlier seasons, with this season's pace against last year. |
| 60-second tour | A self-advancing guided walk through the key findings, built for judges. |
| Blind Clock | When each satellite passes over a region (Pakistan time), the longest unwatched stretch, and how Terra and Aqua are drifting. |
| Burn Window Advisor | On the Blind Clock tab: whether the district is watched right now, a 24-hour strip of the four satellites still flying, and the best hours for field checks. |
| Industrial heat | Year-round hot spots (the same 1 km cell hot on 60+ days across 8+ months), likely kilns, flares and factories, kept out of the crop-fire record and mapped on their own, with a smog-season filter. |
| District scorecards | A shareable page and share image for every district and province at /district/<id>: fire rank, this season against the usual, the Suomi NPP blind-spot share and the Trust Score. |
| BlindSpot AI | Gemini answers questions from the site's own data via function calling, in English or Urdu. Every number in an answer is checked against the tool results on the server. |
| Fire history | Month × year heatmap (harmonized or raw), this month vs the historical median, and the harmonization check per satellite era. |
| Area & export | Click the map or type lat/lon + radius to recompute everything for your own area; download fire events, the daily calendar or a monthly summary as CSV for any date range. |
| How it works | Every step, the calibration test (with a matched MODIS vs VIIRS scatter and pixel footprints to scale), the limits, and data credits. |

## Repository layout

```
pipeline/            Python data pipeline (run in order)
  01_download.py     FIRMS area API downloader (needs FIRMS_MAP_KEY)
  02_load.py         read archive zips + API CSVs, normalise, attach districts
  03_harmonize.py    dedup, MODIS-VIIRS matching, FRP calibration, confidence, event fusion
  04_products.py     writes the static JSON the website reads
  05_industry.py     year-round hot spots -> industry.json
  06_scorecards.py   per-district scorecards -> web/lib/scorecards.json
  07_pairs_sample.py matched MODIS/VIIRS pairs for the How it works page
  boundaries/        geoBoundaries Pakistan ADM1/ADM2 (CC BY 4.0)
data/raw/            FIRMS downloads (not committed)
data/processed/      parquet outputs (not committed)
web/                 Next.js site; web/public/data holds the generated JSON (committed)
```

## Run the pipeline

```bash
cd pipeline
pip install -r requirements.txt
cp .env.example .env            # put your FIRMS MAP_KEY in it

# Put the FIRMS archive zips (MODIS C6.1 + VIIRS SNPP/NOAA-20/NOAA-21, Pakistan) in data/raw/archive/
python 01_download.py           # recent days via the area API
python 01_download.py --all-history   # optional: 2000-2023 history (slow, rate limited)
python 02_load.py
python 03_harmonize.py
python 04_products.py           # writes web/public/data/
python 05_industry.py
python 06_scorecards.py
python 07_pairs_sample.py
```

## Run the website

```bash
cd web
npm install
cp .env.example .env.local      # GEMINI_API_KEY, FIRMS_MAP_KEY, GOOGLE_MAPS_API_KEY
npm run dev                     # http://localhost:3000
```

### Deploy on Vercel

1. Import the GitHub repo in Vercel and set **Root Directory** to `web`.
2. Add environment variables `GEMINI_API_KEY` (BlindSpot AI), `FIRMS_MAP_KEY` (Live tab) and `GOOGLE_MAPS_API_KEY` (Google basemaps and place search; without it the site falls back to Esri and NASA GIBS). Add `GEMINI_MODEL` only if the default model isn't available on the key.
3. Deploy. Everything except BlindSpot AI, the Live tab and Google tiles is static.

All keys stay on the server (`app/api/` routes); they are never sent to the browser.

## Method in short

1. **Dedup** swath-overlap duplicates (same satellite, 10 min, half a pixel).
2. **Match** Aqua MODIS to VIIRS from the same pass (30 min, half a MODIS pixel): 94,011 pairs.
3. **Calibrate** MODIS FRP onto the VIIRS scale per pixel-size bin. Time-split test (train before 2025-05-15): bias factor 2.04× → 1.15×.
4. **Common confidence**: how often each sensor/class is confirmed by another satellite within 1 km and 90 min when one was overhead.
5. **Fuse** all detections within 0.75 km on the same Pakistan day into one event; event FRP is the strongest single pass.
6. **Persistent heat** (kilns, industry, flares): cells active on 30+ days are kept out of the calendar.
7. **Harmonize counts across eras**: the number of fires recorded depends on which satellites were flying. Inside the 2023–2026 window we learn, per province and month, how many events the full five-satellite constellation records for every event a smaller set (MODIS only, MODIS + Suomi NPP, …) sees. Leave-one-year-out test, monthly error raw → harmonized: Terra only 97% → 55%, Terra + Aqua 91% → 29%, + Suomi NPP 55% → 7.5%, today's constellation 21% → 3.1%.

Full detail and limits are on the site's How it works page.

## Data and credits

We acknowledge the use of data and imagery from NASA's Fire Information for Resource Management System (FIRMS), part of NASA's Earth Science Data and Information System (ESDIS), and imagery from NASA GIBS. MODIS Collection 6.1 Active Fire (MCD14ML/MCD14DL); VIIRS 375 m Active Fire from Suomi NPP, NOAA-20 and NOAA-21. District boundaries from geoBoundaries (CC BY 4.0). Basemap © Esri; NASA GIBS imagery.

## Use of Super Intelligence (SI) / AI

- **Code and text:** much of the Python pipeline and the web app was written and debugged with an SI coding assistant (Anthropic Claude), directed and checked by the team. Commit history and this note are the record of that.
- **Logo and slide deck:** the BlindSpot logo (an SVG drawn in code) and the slide layouts were designed with SI assistance.
- **Inside the product:** BlindSpot AI uses Google Gemini through function calling over this site's data, with a server-side check that every number in a reply appears in the data.
- **Not SI-generated:** every map, chart and figure is drawn by our code from NASA data.

## Team Hexabytes

Huzaifa Shahid · Muneeb Mustafa · Ashar Raza
