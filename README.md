## 🌍 RouteXplore

Discover tourist spots along your journey.

RouteXplore helps you turn a normal Google Maps route into a scenic trip with tourist attractions.

### 🚀 What is RouteXplore?

Most of us already use Google Maps to plan trips. But what if you could:
- Paste your Google Maps route link
- Get a list of tourist places along the way
- Select the spots you like
- Generate a new Google Maps link with those places added as waypoints
- Share it instantly with friends or open in Google Maps

That’s exactly what RouteXplore does ✨

### 🛠 How It Works

- Input → User shares a Google Maps route link (start → end).
- Parse → Backend extracts start and end locations.
- Discover → Fetch tourist places along the route (Overpass API / Google Places API).
- Select → User chooses which places to include.
- Generate → Create a new Google Maps route with waypoints.
- Share → One click to share or open in Google Maps.

### 📦 Tech Stack

- Backend (Node.js)
  - Express.js → API endpoints
  - Axios → HTTP requests
  - Overpass API (OpenStreetMap) → Tourist place data
  - Nominatim → Geocoding place names

### 📂 API Endpoints

- GET `/health` → Health check
- POST `/api/parse-link` → Extract start, end, and optional waypoints from a Google Maps URL
- GET `/api/places?start=...&end=...` → Fetch tourist attractions between two points
- POST `/api/generate-route` → Create a Google Maps link with optional waypoints

### ⚙️ Endpoint Parameters

- GET `/health`
  - No parameters

- POST `/api/parse-link`
  - Body (JSON):
    - Required:
      - `link` (string) → Google Maps URL to parse. Supports `api=1`, `/maps/dir/...`, and legacy `saddr/daddr` styles; short links will be resolved.

- GET `/api/places`
  - Query params:
    - Required:
      - `start` (string) → Either `lat,lng` (e.g., `48.8584,2.2945`) or a place name (geocoded).
      - `end` (string) → Either `lat,lng` or a place name (geocoded).
    - Optional:
      - `padding` (number) → Expands the bounding box around the route; default `0.1` degrees.
      - `types` (string) → Comma-separated OSM `tourism` values to include. If omitted, defaults to: `attraction,viewpoint,museum,gallery,aquarium,zoo,theme_park,artwork,monument,archaeological_site,information,picnic_site,camp_site`.
      - `includeAccommodation` (boolean) → If `true`, adds accommodation types to the search: `hotel,hostel,guest_house,motel,apartment,resort,chalet,alpine_hut,caravan_site`. Default `false`.
      - `format` (string) → `simple` | `raw`. `simple` returns a compact list of places; `raw` (default) includes Overpass response under `data` and filtered items under `filtered`.
      - `limit` (number) → Max number of results (1–200). Default: all.
      - `minName` (boolean) → If `false`, include unnamed results; default `true` (exclude unnamed).

- POST `/api/generate-route`
  - Body (JSON):
    - Required:
      - `start` (string) → Origin. Accepts place names or `lat,lng`.
      - `end` (string) → Destination. Accepts place names or `lat,lng`.
    - Optional:
      - `waypoints` (array) → Waypoints as strings or objects:
        - string → waypoint value (e.g., `"Arc de Triomphe"`)
        - object → `{ value: string, via: boolean }` to force a via point when `via: true`
      - `format` (string) → `path` (default) for `/maps/dir/...` URLs, or `api` for `?api=1` URLs.
      - `travelmode` (string) → `driving` (default) | `walking` | `bicycling` | `transit` (only used for `format: "api"`).

### 🧪 Usage with curl

- Health check:
```bash
curl -s http://localhost:5050/health
```

- Parse a Google Maps link:
```bash
curl -s -X POST http://localhost:5050/api/parse-link \
  -H 'Content-Type: application/json' \
  -d '{
    "link": "https://www.google.com/maps/dir/?api=1&origin=Eiffel+Tower&destination=Louvre+Museum&waypoints=Arc+de+Triomphe"
  }'
```

- Find tourist places between two points (using coordinates):
```bash
curl -s 'http://localhost:5050/api/places?start=48.8584,2.2945&end=48.8606,2.3376&format=simple&limit=10'
```

- Generate a route URL (API format):
```bash
curl -s -X POST http://localhost:5050/api/generate-route \
  -H 'Content-Type: application/json' \
  -d '{
    "start": "Eiffel Tower",
    "end": "Louvre Museum",
    "waypoints": ["Arc de Triomphe"],
    "format": "api",
    "travelmode": "driving"
  }'
```

### 🎯 Why RouteXplore?

- ✅ Simple → No need to learn a new map app
- ✅ Flexible → Works with any frontend
- ✅ Shareable → Send trips to friends in one link
- ✅ Open → Built on open data (OSM / Google APIs)

### 🏗 Roadmap

- Build basic Node.js backend
- Integrate Overpass API for tourist places
- Add Google Places API option (premium data)
- Implement link sharing

### 🤝 Contributing

- Fork the repo
- Create a feature branch (`git checkout -b feature/new-feature`)
- Commit changes (`git commit -m "Add new feature"`)
- Push to branch (`git push origin feature/new-feature`)
- Open a Pull Request

### 📜 License

This project is licensed under the PolyForm Noncommercial License 1.0.0.

- Non-commercial use: permitted under the license.
- Commercial use: requires a commercial license. See `COMMERCIAL-LICENSE.md`.

See `LICENSE` for full text. Learn more: https://polyformproject.org/licenses/noncommercial/1.0.0/
