Simulated demo dataset for the VidyutOne MVP.

Coordinates are realistic-looking Bengaluru locations but are NOT live
infrastructure, demand, or grid measurements. Treat all values as demo data.

`sites.json` and `chargers.json` above are the original 10/14-row hand-authored
demo set, still used by `seed_demo.py`. The `*_bengaluru.json` files below are
real data, fetched offline by `python -m app.scripts.fetch_bengaluru_data`
(see that script's docstring) — the API never calls these sources itself.

## SOURCES

Fetched 2026-08-23, scoped to OSM relation 7902476 ("Bengaluru", operator
Greater Bengaluru Authority — the successor to BBMP), bounds
`12.8335–13.1426 N, 77.4599–77.7841 E`.

| File | Source | Licence | Notes |
|---|---|---|---|
| `chargers_bengaluru.json` | [OpenChargeMap](https://openchargemap.org) `v3/poi` API | [OCM Open Data Licence](https://openchargemap.org/site/develop/api#licence) (CC-BY-SA-style, attribution required) | Real, currently-listed public chargers: 165 POIs / 297 charger-connector rows within 30km of city centre. Requires a free API key (`OCM_API_KEY` in `backend/.env`, gitignored). |
| `candidate_sites_bengaluru.json` | [OpenStreetMap](https://www.openstreetmap.org) via [Overpass API](https://overpass-api.de) | [ODbL 1.0](https://www.openstreetmap.org/copyright) | Real fuel stations, parking lots, malls, bus stations, Namma Metro subway stations inside the boundary above. `name_is_real: false` flags features OSM has no name tag for (id/coordinates are still real). |
| `substations_bengaluru.json` | OSM `power=substation`/`power=transformer` (Overpass) joined by name to [BESCOM substation list, March 2019](https://data.opencity.in/dataset/bescom-data) (OpenCity) | OSM: ODbL 1.0. OpenCity/BESCOM: [OpenCity terms](https://opencity.in/terms) (attribution requested) | Grid **proxy**, not measured feeder capacity — see `backend/app/engines/site_scoring.py` provenance labels once Phase B lands. `matched: true` rows have both a real coordinate (OSM) and BESCOM's official voltage class; unmatched BESCOM rows are kept with no coordinate rather than dropped. |
| `ev_registrations_bengaluru.json` | [VAHAN RTO-wise registrations, 2021–2025](https://data.opencity.in/dataset/bengaluru-rto-wise-vehicle-registration-data) (OpenCity, sourced from MoRTH VAHAN) | [OpenCity terms](https://opencity.in/terms) | Real EV counts (`PURE EV` + `ELECTRIC(BOV)` + `PLUG-IN HYBRID EV` fuel types), not a total-registrations proxy — VAHAN's `Registration Fuel` column breaks out fuel type directly. |
| `localities_bengaluru.json` | OSM `place=suburb`/`place=neighbourhood` (Overpass) | ODbL 1.0 | 873 real locality names ("Whitefield", "Jayanagar", ...) for `/api/sites/suggest` and `/api/sites/classify?q=` — coarser than the candidate-site names above. Not every colloquial area name is OSM-tagged this way (e.g. "Electronic City" isn't); name search falls back to candidate-site names and fuzzy matching for those. |

Attribution is surfaced in the planner UI footer (frontend/src/components/planner) once Phase B wires these files into the API response — tracked there, not duplicated here.

Raw responses are cached under `data/raw/` so re-running the fetch script is
free and doesn't re-hit any of the above APIs; delete a file there (or pass
`--refresh`) to force a re-fetch.
