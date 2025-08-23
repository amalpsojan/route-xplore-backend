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

// Parse Google Maps link to extract start, end, and optional waypoints
router.post("/", async (req, res) => {
  const { link } = req.body;

  if (!link) {
    return res.status(400).json({ error: "No link provided" });
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
      return res.json({
        start: { name: fromApi.start.replace(/\+/g, " "), coordinates: startC || null },
        end: { name: fromApi.end.replace(/\+/g, " "), coordinates: endC || null },
        waypoints: fromApi.waypoints,
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
      return res.json({
        start: { name: fromDir.start.replace(/\+/g, " "), coordinates: startC || null },
        end: { name: fromDir.end.replace(/\+/g, " "), coordinates: endC || null },
        waypoints: fromDir.waypoints,
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
      return res.json({
        start: { name: fromSaddr.start.replace(/\+/g, " "), coordinates: startC || null },
        end: { name: fromSaddr.end.replace(/\+/g, " "), coordinates: endC || null },
        waypoints: fromSaddr.waypoints,
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
