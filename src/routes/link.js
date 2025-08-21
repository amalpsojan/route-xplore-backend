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

function tryParseSaddrDaddr(finalUrlString) {
  try {
    const url = new URL(finalUrlString);
    const saddr = url.searchParams.get("saddr");
    const daddr = url.searchParams.get("daddr");
    if (!saddr || !daddr) return null;
    // Some links include ftid/skid params; ignore. Waypoints sometimes come via repeated daddr or via waypoints param.
    // Attempt to parse optional 'waypoints' as well if present
    const waypointsParam = url.searchParams.get("waypoints") || "";
    const waypoints = waypointsParam
      ? waypointsParam.split("|").map((w) => decodeURIComponent(w)).filter(Boolean)
      : [];
    return { start: decodeURIComponent(saddr), end: decodeURIComponent(daddr), waypoints };
  } catch (_) {
    return null;
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
      return res.json({ ...fromApi, meta: { inputLink: link, finalUrl, parsedFrom: "api=1" } });
    }

    // Fallback to /dir/ path style
    const fromDir = tryParseDirPath(finalUrl);
    if (fromDir) {
      return res.json({ ...fromDir, meta: { inputLink: link, finalUrl, parsedFrom: "dir" } });
    }

    // Support legacy saddr/daddr style
    const fromSaddr = tryParseSaddrDaddr(finalUrl);
    if (fromSaddr) {
      return res.json({ ...fromSaddr, meta: { inputLink: link, finalUrl, parsedFrom: "saddr-daddr" } });
    }

    return res.status(400).json({ error: "Unrecognized Google Maps link format", meta: { inputLink: link, finalUrl } });
  } catch (error) {
    console.error(error.message);
    return res.status(500).json({ error: "Failed to parse link" });
  }
});

module.exports = router;
