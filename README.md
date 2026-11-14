# BlindSpot

**One fire record from two satellite families, and an honest map of what it misses.**

NASA Space Apps Challenge 2026 · *Harmonization of MODIS and VIIRS Hot Spots* · Pakistan

On 2 November 2026 NASA stopped Suomi NPP fire data. BlindSpot fuses MODIS (Terra, Aqua) and VIIRS 375 m (Suomi NPP, NOAA-20, NOAA-21) detections into one harmonized record of fire events for Pakistan, then shows what that record lost: **22.9% of Pakistan's fire events from Nov 2023 to Nov 2026 were seen only by Suomi NPP.**

## What's on the site

| Screen | What it shows |
| --- | --- |
| Burning calendar | One square per day of harmonized fire events for Pakistan, a province or any of 126 districts. Unusual days, critical burning weeks, wheat and rice burning seasons, and a click-through map of each day with NASA GIBS imagery. |
| Lost Eyes | Share of events seen only by each satellite, month by month, by fire size, and the districts that lose the most. |
| Blind Clock | When each satellite passes over a region (Pakistan time), the longest unwatched stretch, and how Terra and Aqua are drifting. |
| Ask BlindSpot | Gemini answers questions from the site's own data via function calling, in English or Urdu. Every number in an answer is checked against the tool results on the server. |
| Method | Every step, the calibration test, the limits, and data credits. |

## Repository layout

```
pipeline/            Python data pipeline (run in order)
  01_download.py     FIRMS area API downloader (needs FIRMS_MAP_KEY)
  02_load.py         read archive zips + API CSVs, normalise, attach districts
  03_harmonize.py    dedup, MODIS-VIIRS matching, FRP calibration, confidence, event fusion
  04_products.py     writes the static JSON the website reads
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
```

## Run the website

```bash
cd web
npm install
cp .env.example .env.local      # GEMINI_API_KEY for Ask BlindSpot
npm run dev                     # http://localhost:3000
```

### Deploy on Vercel

1. Import the GitHub repo in Vercel and set **Root Directory** to `web`.
2. Add environment variable `GEMINI_API_KEY` (and `GEMINI_MODEL` only if the default model isn't available on the key).
3. Deploy. Everything except Ask BlindSpot is static.

The Gemini key stays on the server (`app/api/ask/route.ts`); it is never sent to the browser.

## Method in short

1. **Dedup** swath-overlap duplicates (same satellite, 10 min, half a pixel).
2. **Match** Aqua MODIS to VIIRS from the same pass (30 min, half a MODIS pixel): 4,186 pairs.
3. **Calibrate** MODIS FRP onto the VIIRS scale per pixel-size bin. Time-split test (train before 2025-05-15): bias factor 2.05× → 1.22×.
4. **Common confidence**: how often each sensor/class is confirmed by another satellite within 1 km and 90 min when one was overhead.
5. **Fuse** all detections within 0.75 km on the same Pakistan day into one event; event FRP is the strongest single pass.
6. **Persistent heat** (kilns, industry, flares): cells active on 30+ days are kept out of the calendar.

Full detail and limits are on the site's Method page.

## Data and credits

We acknowledge the use of data and imagery from NASA's Fire Information for Resource Management System (FIRMS), part of NASA's Earth Science Data and Information System (ESDIS), and imagery from NASA GIBS. MODIS Collection 6.1 Active Fire (MCD14ML/MCD14DL); VIIRS 375 m Active Fire from Suomi NPP, NOAA-20 and NOAA-21. District boundaries from geoBoundaries (CC BY 4.0). Basemap © Esri; NASA GIBS imagery.

## Use of AI

Ask BlindSpot uses Google Gemini through function calling over this site's data. AI coding assistants were used while building the project.

## Team

Huzaifa Shahid · Muneeb Mustafa · Ashar Raza
