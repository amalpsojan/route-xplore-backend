const express = require("express");
const axios = require("axios");

const router = express.Router();

function parseLatLng(paramValue) {
  if (typeof paramValue !== "string") return null;
  const parts = paramValue.split(",");
  if (parts.length !== 2) return null;
  const lat = Number(parts[0]);
  const lng = Number(parts[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

async function geocodeIfNeeded(input) {
  // If already lat,lng → return as-is
  const coords = parseLatLng(input);
  if (coords) return coords;

  // Otherwise, treat as place name and geocode via Nominatim
  if (typeof input !== "string" || input.trim().length === 0) return null;
  const query = input.trim();
  try {
    const resp = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: { q: query, format: "json", limit: 1 },
      headers: {
        "User-Agent": "RouteXplore/1.0 (contact: example@routexplore.app)",
        Accept: "application/json",
      },
      timeout: 10000,
    });
    const first = Array.isArray(resp.data) ? resp.data[0] : null;
    if (!first?.lat || !first?.lon) return null;
    return { lat: Number(first.lat), lng: Number(first.lon) };
  } catch (_err) {
    return null;
  }
}

router.get("/", async (req, res) => {
  try {
    const { start, end, padding, types, format, limit, minName, includeAccommodation } = req.query;

    // Accept either coordinates ("lat,lng") OR place names → geocode internally
    const [startCoord, endCoord] = await Promise.all([
      geocodeIfNeeded(start),
      geocodeIfNeeded(end),
    ]);

    if (!startCoord || !endCoord) {
      return res.status(400).json({
        error:
          "Invalid or missing start/end. Provide 'lat,lng' or a place name for both.",
      });
    }

    const minLat = Math.min(startCoord.lat, endCoord.lat);
    const maxLat = Math.max(startCoord.lat, endCoord.lat);
    const minLng = Math.min(startCoord.lng, endCoord.lng);
    const maxLng = Math.max(startCoord.lng, endCoord.lng);

    const pad = Number(padding) || 0.1; // ~11km latitude; longitude varies with latitude

    const south = clamp(minLat - pad, -90, 90);
    const west = clamp(minLng - pad, -180, 180);
    const north = clamp(maxLat + pad, -90, 90);
    const east = clamp(maxLng + pad, -180, 180);

    const defaultAllowed = [
      "attraction",
      "viewpoint",
      "museum",
      "gallery",
      "aquarium",
      "zoo",
      "theme_park",
      "artwork",
      "monument",
      "archaeological_site",
      "information",
      "picnic_site",
      "camp_site",
    ];
    const accommodation = new Set([
      "hotel",
      "hostel",
      "guest_house",
      "motel",
      "apartment",
      "resort",
      "chalet",
      "alpine_hut",
      "caravan_site",
    ]);

    const includeAcc = String(includeAccommodation || "false").toLowerCase() === "true";
    let allowedTypes = (types || "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    if (allowedTypes.length === 0) {
      allowedTypes = defaultAllowed.slice();
      if (includeAcc) {
        allowedTypes = allowedTypes.concat(Array.from(accommodation));
      }
    }

    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const typeRegex = allowedTypes.map(esc).join("|");

    const query = `
      [out:json][timeout:25];
      (
        node["tourism"~"^(${typeRegex})$"](${south},${west},${north},${east});
        way["tourism"~"^(${typeRegex})$"](${south},${west},${north},${east});
        relation["tourism"~"^(${typeRegex})$"](${south},${west},${north},${east});
      );
      out center;
    `;

    const response = await axios({
      method: "POST",
      url: "https://overpass-api.de/api/interpreter",
      headers: { "Content-Type": "text/plain" },
      data: query,
      timeout: 25000,
    });

    const elements = Array.isArray(response.data?.elements) ? response.data.elements : [];
    const wantMinName = String(minName ?? "true").toLowerCase() !== "false"; // default true
    const midLat = (startCoord.lat + endCoord.lat) / 2;
    const midLng = (startCoord.lng + endCoord.lng) / 2;

    const withCoords = elements
      .map((el) => {
        const tourism = el.tags?.tourism;
        const name = el.tags?.name || el.tags?.["name:en"] || null;
        const lat = el.lat ?? el.center?.lat ?? null;
        const lon = el.lon ?? el.center?.lon ?? null;
        if (!tourism || lat == null || lon == null) return null;
        if (wantMinName && !name) return null;
        return { id: el.id, type: el.type, tourism, name, lat, lon, tags: el.tags || {} };
      })
      .filter(Boolean);

    // Sort by distance to midpoint (rough minimal sorting)
    const sorted = withCoords.sort((a, b) => {
      const da = (a.lat - midLat) * (a.lat - midLat) + (a.lon - midLng) * (a.lon - midLng);
      const db = (b.lat - midLat) * (b.lat - midLat) + (b.lon - midLng) * (b.lon - midLng);
      return da - db;
    });

    const parsedLimit = Number(limit);
    const lim = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : null;
    const sliced = lim ? sorted.slice(0, lim) : sorted;

    const fmt = (format || "raw").toString().toLowerCase();
    if (fmt === "simple") {
      return res.json({
        bbox: { south, west, north, east },
        start: startCoord,
        end: endCoord,
        places: sliced.map((p) => ({
          id: p.id,
          name: p.name,
          tourism: p.tourism,
          coordinates: { lat: p.lat, lng: p.lon },
          tags: p.tags,
        })),
        meta: { allowedTypes, limit: lim ?? "all" },
      });
    }

    res.json({
      bbox: { south, west, north, east },
      start: startCoord,
      end: endCoord,
      data: response.data,
      filtered: sliced,
      meta: { allowedTypes, limit: lim ?? "all" },
    });
  } catch (error) {
    const errMsg = error.response?.data || error.message || "Unknown error";
    console.error(errMsg);
    res.status(500).json({ error: "Failed to fetch tourist places" });
  }
});

module.exports = router;
