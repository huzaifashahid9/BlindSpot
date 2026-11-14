# BlindSpot

**NASA Space Apps Challenge 2026 entry, MODIS/VIIRS harmonization challenge.**

BlindSpot maps the fires in Pakistan that only one satellite saw. Using NASA FIRMS active-fire data, it compares MODIS and VIIRS detections and highlights the **Lost Eyes**: fires picked up by one sensor but missed by the other. These gaps show where relying on a single satellite would leave fires unseen.

## How it works

1. **Pipeline (Python):** downloads FIRMS MODIS and VIIRS fire detections for Pakistan, matches them in space and time, and flags single-sensor detections.
2. **Web app (Next.js):** an interactive map of matched fires and Lost Eyes.
3. **AI summaries (Gemini):** plain-language explanations of where and why the sensors disagree.

## Tech stack

- Python (data pipeline)
- Next.js (frontend)
- Google Gemini (AI summaries)
- NASA FIRMS (MODIS and VIIRS active-fire data)

## Team

- Anas
- Muneeb Mustafa
- Huzaifa Shahid
- Ashar Raza

## License

See [LICENSE](LICENSE).
