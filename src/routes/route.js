const express = require("express");
const axios = require("axios");
const router = express.Router();

function isValidCoord(obj) {
  return (
    obj &&
    typeof obj.lat === "number" &&
    typeof obj.lng === "number" &&
    Number.isFinite(obj.lat) &&
    Number.isFinite(obj.lng) &&
    obj.lat >= -90 &&
    obj.lat <= 90 &&
    obj.lng >= -180 &&
    obj.lng <= 180
  );
}

function parseLatLngString(value) {
  if (typeof value !== "string") return null;
  const parts = value.split(",").map((s) => s.trim());
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function mapTravelModeToOsrmProfile(mode) {
  const m = String(mode || "driving").toLowerCase();
  if (m === "walking") return "walking";
  if (m === "bicycling" || m === "cycling") return "cycling";
  return "driving";
}

// POST /api/route -> returns OSRM route polyline/geometry
router.post("/", async (req, res) => {
  try {
    const { startCoordinates, endCoordinates, start, end, travelmode, geometry } = req.body || {};
    const startCoord = isValidCoord(startCoordinates) ? startCoordinates : parseLatLngString(start);
    const endCoord = isValidCoord(endCoordinates) ? endCoordinates : parseLatLngString(end);
    if (!startCoord || !endCoord) {
      return res.status(400).json({ error: "Provide start and end coordinates (object {lat,lng} or string 'lat,lng')" });
    }

    const profile = mapTravelModeToOsrmProfile(travelmode);
    const url = `https://router.project-osrm.org/route/v1/${profile}/${startCoord.lng},${startCoord.lat};${endCoord.lng},${endCoord.lat}`;
    const geometries = geometry === "polyline6" ? "polyline6" : geometry === "polyline" ? "polyline" : "geojson";
    const resp = await axios.get(url, {
      params: { overview: "full", geometries },
      timeout: 15000,
      headers: { "User-Agent": "RouteXplore/1.0 (contact: example@routexplore.app)", Accept: "application/json" },
      validateStatus: () => true,
    });
    if (resp.status >= 400 || !Array.isArray(resp.data?.routes) || resp.data.routes.length === 0) {
      return res.status(502).json({ error: "Routing failed" });
    }
    const route = resp.data.routes[0];
    let encodedPolyline = null;
    let coordinates = [];
    let geometryOut = null;
    if (geometries === "geojson") {
      geometryOut = route.geometry || null; // GeoJSON LineString
      if (Array.isArray(geometryOut?.coordinates)) {
        coordinates = geometryOut.coordinates.map(([lng, lat]) => ({ lat, lng }));
      }
    } else {
      encodedPolyline = route.geometry; // polyline or polyline6
    }
    return res.json({
      provider: "osrm",
      profile,
      distanceMeters: Math.round(route.distance || 0),
      durationSeconds: Math.round(route.duration || 0),
      osrmUrl: `${url}?overview=full&geometries=${geometries}`,
      geometry: geometryOut,
      encodedPolyline,
      coordinates,
    });
  } catch (error) {
    console.error(error?.message || error);
    return res.status(500).json({ error: "Failed to generate route" });
  }
});

module.exports = router;
