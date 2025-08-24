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

async function reverseGeocodeLabel(coord) {
  try {
    const resp = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      params: { format: "jsonv2", lat: coord.lat, lon: coord.lng, zoom: 14, addressdetails: 1 },
      timeout: 8000,
      headers: {
        "User-Agent": "RouteXplore/1.0 (contact: example@routexplore.app)",
        Accept: "application/json",
      },
      validateStatus: () => true,
    });
    if (resp.status >= 400 || !resp.data) return null;
    const d = resp.data;
    const a = d.address || {};
    // Try to build a concise label
    const candidates = [
      d.name,
      a.attraction,
      a.tourism,
      a.building,
      a.amenity,
      a.road && a.city ? `${a.road}, ${a.city}` : null,
      a.suburb && a.city ? `${a.suburb}, ${a.city}` : null,
      a.village && a.state ? `${a.village}, ${a.state}` : null,
      a.city && a.state ? `${a.city}, ${a.state}` : null,
      d.display_name,
    ].filter(Boolean);
    return candidates.length > 0 ? String(candidates[0]) : null;
  } catch (_) {
    return null;
  }
}

// POST /api/route -> returns OSRM route polyline/geometry
router.post("/", async (req, res) => {
  try {
    const { startCoordinates, endCoordinates, start, end, startName, endName, travelmode, geometry } = req.body || {};
    const startCoord = isValidCoord(startCoordinates) ? startCoordinates : parseLatLngString(start);
    const endCoord = isValidCoord(endCoordinates) ? endCoordinates : parseLatLngString(end);
    if (!startCoord || !endCoord) {
      return res.status(400).json({ error: "Provide start and end coordinates (object {lat,lng} or string 'lat,lng')" });
    }
    const [autoStart, autoEnd] = await Promise.all([
      typeof startName === "string" ? Promise.resolve(null) : reverseGeocodeLabel(startCoord),
      typeof endName === "string" ? Promise.resolve(null) : reverseGeocodeLabel(endCoord),
    ]);
    const startLabel = typeof startName === "string" ? startName : (autoStart || `${startCoord.lat},${startCoord.lng}`);
    const endLabel = typeof endName === "string" ? endName : (autoEnd || `${endCoord.lat},${endCoord.lng}`);

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
      start: { name: startLabel, coordinates: startCoord },
      end: { name: endLabel, coordinates: endCoord },
    });
  } catch (error) {
    console.error(error?.message || error);
    return res.status(500).json({ error: "Failed to generate route" });
  }
});

// POST /api/route-with-waypoints
// Body:
//   start: string   ("lat,lng")
//   end: string     ("lat,lng")
//   waypoints?: string[] (each "lat,lng")
//   geometry?: "geojson" | "polyline" | "polyline6"
router.post("/with-waypoints", async (req, res) => {
  try {
    const { start, end, waypoints, geometry, travelmode } = req.body || {};
    const startCoord = parseLatLngString(start);
    const endCoord = parseLatLngString(end);
    if (!startCoord || !endCoord) {
      return res.status(400).json({ error: "Provide start and end as 'lat,lng' strings" });
    }
    const via = Array.isArray(waypoints)
      ? waypoints.map(parseLatLngString).filter(Boolean)
      : [];

    const profile = mapTravelModeToOsrmProfile(travelmode);
    const coordsPath = [startCoord, ...via, endCoord]
      .map((c) => `${c.lng},${c.lat}`)
      .join(";");
    const url = `https://router.project-osrm.org/route/v1/${profile}/${coordsPath}`;
    const geometries = geometry === "polyline6" ? "polyline6" : geometry === "polyline" ? "polyline" : "geojson";
    const resp = await axios.get(url, {
      params: { overview: "full", geometries },
      timeout: 20000,
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
      geometryOut = route.geometry || null;
      if (Array.isArray(geometryOut?.coordinates)) {
        coordinates = geometryOut.coordinates.map(([lng, lat]) => ({ lat, lng }));
      }
    } else {
      encodedPolyline = route.geometry;
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
      start: { coordinates: startCoord },
      end: { coordinates: endCoord },
      waypoints: via,
    });
  } catch (error) {
    console.error(error?.message || error);
    return res.status(500).json({ error: "Failed to generate route with waypoints" });
  }
});

module.exports = router;
