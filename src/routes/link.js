const express = require("express");
const axios = require("axios");
const { URL } = require("url");

const router = express.Router();

function tryParseApiParams(finalUrlString) {
  try {
    const url = new URL(finalUrlString);
    const api = url.searchParams.get("api");
    if (api !== "1") return null;
    const origin = url.searchParams.get("origin") || undefined;
    const destination = url.searchParams.get("destination") || undefined;
    const waypointsParam = url.searchParams.get("waypoints") || "";
    const waypoints = waypointsParam
      ? waypointsParam.split("|").map((w) => decodeURIComponent(w)).filter(Boolean)
      : [];
    if (!origin || !destination) return null;
    return { start: decodeURIComponent(origin), end: decodeURIComponent(destination), waypoints };
  } catch (_) {
    return null;
  }
}

function tryParseDirPath(finalUrlString) {
  try {
    // Handle paths like /maps/dir/Start/WP1/WP2/End or /dir/Start/End
    const url = new URL(finalUrlString);
    const path = url.pathname;
    const dirIndex = path.indexOf("/dir/");
    if (dirIndex === -1) return null;
    const afterDir = path.slice(dirIndex + 5); // skip '/dir/'
    // Stop at '@' (map center) or any trailing path after query-like markers
    const stopChars = ["@", ";"]; // conservative
    let trimmed = afterDir;
    for (const ch of stopChars) {
      const i = trimmed.indexOf(ch);
      if (i !== -1) trimmed = trimmed.slice(0, i);
    }
    const rawSegments = trimmed.split("/").filter(Boolean);
    if (rawSegments.length < 2) return null;
    const decoded = rawSegments.map((s) => decodeURIComponent(s));
    const start = decoded[0];
    const end = decoded[decoded.length - 1];
    const waypoints = decoded.slice(1, decoded.length - 1);
    return { start, end, waypoints };
  } catch (_) {
    return null;
  }
}

function tryParseSaddrDaddr(finalUrlString) {
  try {
    const url = new URL(finalUrlString);
    const saddr = url.searchParams.get("saddr");
    const daddr = url.searchParams.get("daddr");
    if (!saddr || !daddr) return null;
    const waypointsParam = url.searchParams.get("waypoints") || "";
    const waypoints = waypointsParam
      ? waypointsParam.split("|").map((w) => decodeURIComponent(w)).filter(Boolean)
      : [];
    return { start: decodeURIComponent(saddr), end: decodeURIComponent(daddr), waypoints };
  } catch (_) {
    return null;
  }
}

async function resolveIfShortLink(originalLink) {
  try {
    const lower = originalLink.toLowerCase();
    const isShort =
      lower.includes("maps.app.goo.gl") ||
      lower.includes("goo.gl/maps") ||
      lower.includes("shorturl.at") ||
      lower.includes("bit.ly") ||
      (!lower.includes("/maps/dir/") && !lower.includes("api=1"));

    if (!isShort) return originalLink;

    const response = await axios.get(originalLink, {
      maxRedirects: 10,
      timeout: 10000,
      validateStatus: () => true,
    });

    const responseUrl =
      response.request?.res?.responseUrl ||
      response.request?.responseURL ||
      response.headers?.location ||
      originalLink;
    return responseUrl;
  } catch (_) {
    return originalLink;
  }
}

async function geocodeName(name) {
  if (!name || typeof name !== "string") return null;
  try {
    const cleaned = name.replace(/\+/g, " ").trim();
    const resp = await axios.get("https://nominatim.openstreetmap.org/search", {
      params: { q: cleaned, format: "json", limit: 1 },
      headers: {
        "User-Agent": "RouteXplore/1.0 (contact: example@routexplore.app)",
        Accept: "application/json",
      },
      timeout: 10000,
    });
    const first = Array.isArray(resp.data) ? resp.data[0] : null;
    if (!first?.lat || !first?.lon) return null;
    return { lat: Number(first.lat), lng: Number(first.lon) };
  } catch (_) {
    return null;
  }
}

function extractCoordsFromGoogleUrl(urlString) {
  try {
    // Collect pairs like !1d<lng>!2d<lat>
    const pairs = [];
    const regex = /!1d(-?\d+\.\d+)!2d(-?\d+\.\d+)/g;
    let m;
    while ((m = regex.exec(urlString)) !== null) {
      const lng = Number(m[1]);
      const lat = Number(m[2]);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        pairs.push({ lat, lng });
      }
    }
    return pairs;
  } catch (_) {
    return [];
  }
}

function mapTravelModeToOsrmProfile(mode) {
  const m = String(mode || "driving").toLowerCase();
  if (m === "walking") return "walking";
  if (m === "bicycling" || m === "cycling") return "cycling";
  return "driving"; // default; OSRM has no transit
}

async function fetchOsrmRoute(startCoord, endCoord, travelmode) {
  try {
    const profile = mapTravelModeToOsrmProfile(travelmode);
    const url = `https://router.project-osrm.org/route/v1/${profile}/${startCoord.lng},${startCoord.lat};${endCoord.lng},${endCoord.lat}`;
    const resp = await axios.get(url, {
      params: { overview: "full", geometries: "geojson" },
      timeout: 15000,
      headers: {
        "User-Agent": "RouteXplore/1.0 (contact: example@routexplore.app)",
        Accept: "application/json",
      },
      validateStatus: () => true,
    });
    if (resp.status >= 400 || !Array.isArray(resp.data?.routes) || resp.data.routes.length === 0) {
      return null;
    }
    const route = resp.data.routes[0];
    const geometry = route.geometry || null; // GeoJSON LineString
    const coords = Array.isArray(geometry?.coordinates)
      ? geometry.coordinates.map(([lng, lat]) => ({ lat, lng }))
      : [];
    return {
      osrmUrl: `${url}?overview=full&geometries=geojson`,
      geometry, // GeoJSON LineString as returned by OSRM
      coordinates: coords,
      distanceMeters: Math.round(route.distance || 0),
      durationSeconds: Math.round(route.duration || 0),
      provider: "osrm",
      profile,
    };
  } catch (_) {
    return null;
  }
}

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

// Parse Google Maps link to extract start, end, and optional waypoints
router.post("/", async (req, res) => {
  const { link, includeRoute, travelmode, startCoordinates, endCoordinates, start, end, startName, endName } = req.body || {};

  // PRIORITY: explicit coordinates over map link
  const explicitStart = isValidCoord(startCoordinates)
    ? startCoordinates
    : parseLatLngString(start);
  const explicitEnd = isValidCoord(endCoordinates)
    ? endCoordinates
    : parseLatLngString(end);

  if (explicitStart && explicitEnd) {
    try {
      let route = null;
      if (includeRoute === undefined || includeRoute === true) {
        route = await fetchOsrmRoute(explicitStart, explicitEnd, travelmode);
      }
      return res.json({
        start: { name: typeof startName === "string" ? startName : null, coordinates: explicitStart },
        end: { name: typeof endName === "string" ? endName : null, coordinates: explicitEnd },
        waypoints: [],
        route,
        meta: { inputLink: link || null, parsedFrom: "coordinates" },
      });
    } catch (error) {
      console.error(error.message);
      return res.status(500).json({ error: "Failed to process coordinates" });
    }
  }

  if (!link) {
    return res.status(400).json({ error: "Provide either coordinates (start/end) or a link" });
  }

  try {
    const finalUrl = await resolveIfShortLink(link);

    // Try api=1 style first
    const fromApi = tryParseApiParams(finalUrl);
    if (fromApi) {
      const coordPairs = extractCoordsFromGoogleUrl(finalUrl);
      let [startC, endC] = await Promise.all([
        geocodeName(fromApi.start),
        geocodeName(fromApi.end),
      ]);
      if (!startC && coordPairs[0]) startC = coordPairs[0];
      if (!endC && (coordPairs[1] || coordPairs[0])) endC = coordPairs[1] || coordPairs[0];
      let route = null;
      if (startC && endC && (includeRoute === undefined || includeRoute === true)) {
        route = await fetchOsrmRoute(startC, endC, travelmode);
      }
      return res.json({
        start: { name: fromApi.start.replace(/\+/g, " "), coordinates: startC || null },
        end: { name: fromApi.end.replace(/\+/g, " "), coordinates: endC || null },
        waypoints: fromApi.waypoints,
        route,
        meta: { inputLink: link, finalUrl, parsedFrom: "api=1" },
      });
    }

    // Fallback to /dir/ path style
    const fromDir = tryParseDirPath(finalUrl);
    if (fromDir) {
      const coordPairs = extractCoordsFromGoogleUrl(finalUrl);
      let [startC, endC] = await Promise.all([
        geocodeName(fromDir.start),
        geocodeName(fromDir.end),
      ]);
      if (!startC && coordPairs[0]) startC = coordPairs[0];
      if (!endC && (coordPairs[1] || coordPairs[0])) endC = coordPairs[1] || coordPairs[0];
      let route = null;
      if (startC && endC && (includeRoute === undefined || includeRoute === true)) {
        route = await fetchOsrmRoute(startC, endC, travelmode);
      }
      return res.json({
        start: { name: fromDir.start.replace(/\+/g, " "), coordinates: startC || null },
        end: { name: fromDir.end.replace(/\+/g, " "), coordinates: endC || null },
        waypoints: fromDir.waypoints,
        route,
        meta: { inputLink: link, finalUrl, parsedFrom: "dir" },
      });
    }

    // Support legacy saddr/daddr style
    const fromSaddr = tryParseSaddrDaddr(finalUrl);
    if (fromSaddr) {
      const coordPairs = extractCoordsFromGoogleUrl(finalUrl);
      let [startC, endC] = await Promise.all([
        geocodeName(fromSaddr.start),
        geocodeName(fromSaddr.end),
      ]);
      if (!startC && coordPairs[0]) startC = coordPairs[0];
      if (!endC && (coordPairs[1] || coordPairs[0])) endC = coordPairs[1] || coordPairs[0];
      let route = null;
      if (startC && endC && (includeRoute === undefined || includeRoute === true)) {
        route = await fetchOsrmRoute(startC, endC, travelmode);
      }
      return res.json({
        start: { name: fromSaddr.start.replace(/\+/g, " "), coordinates: startC || null },
        end: { name: fromSaddr.end.replace(/\+/g, " "), coordinates: endC || null },
        waypoints: fromSaddr.waypoints,
        route,
        meta: { inputLink: link, finalUrl, parsedFrom: "saddr-daddr" },
      });
    }

    return res.status(400).json({ error: "Unrecognized Google Maps link format", meta: { inputLink: link, finalUrl } });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: "Failed to parse link" });
  }
});

module.exports = router;
