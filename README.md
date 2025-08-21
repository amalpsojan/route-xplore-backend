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
  - Axios → API requests
  - Overpass API / Google Places API → Tourist place data
- Frontend (any)
  - Can be React Native (Expo), React Web, or others.
  - Example first version: Expo app (React Native)

### 📂 API Endpoints (Planned)

- POST `/parse-link` → Extracts start & end from a Google Maps URL
- GET `/tourist-places?start=...&end=...` → Fetch tourist attractions between two points
- POST `/generate-route` → Creates new Google Maps link with waypoints

### 🎯 Why RouteXplore?

- ✅ Simple → No need to learn a new map app
- ✅ Flexible → Works with any frontend
- ✅ Shareable → Send trips to friends in one link
- ✅ Open → Built on open data (OSM / Google APIs)

### 🏗 Roadmap

- Build basic Node.js backend
- Create React Native (Expo) frontend
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

MIT License © 2025 RouteXplore

✨ RouteXplore – Make your trips more than just a journey.
