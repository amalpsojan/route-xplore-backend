const express = require("express");
const router = express.Router();

function normalizeWaypoints(rawWaypoints) {
  if (!Array.isArray(rawWaypoints)) return [];
  return rawWaypoints
    .map((wp) => {
      if (wp == null) return null;
      if (typeof wp === "string") return { value: wp, via: false };
      if (typeof wp === "object") {
        const value = typeof wp.value === "string" ? wp.value : String(wp.value || "");
        const via = Boolean(wp.via);
        if (!value) return null;
        return { value, via };
      }
      return { value: String(wp), via: false };
    })
    .filter(Boolean);
}

function buildPathUrl(start, end, waypoints) {
  let url = `https://www.google.com/maps/dir/${encodeURIComponent(start)}`;
  waypoints.forEach((wp) => {
    url += `/${encodeURIComponent(wp.value)}`;
  });
  url += `/${encodeURIComponent(end)}`;
  return url;
}

function buildApiUrl(start, end, waypoints, travelmode) {
  const base = new URL("https://www.google.com/maps/dir/");
  base.searchParams.set("api", "1");
  base.searchParams.set("origin", start);
  base.searchParams.set("destination", end);
  if (travelmode) base.searchParams.set("travelmode", travelmode);
  if (waypoints.length > 0) {
    const joined = waypoints
      .map((wp) => (wp.via ? `via:${wp.value}` : wp.value))
      .join("|");
    base.searchParams.set("waypoints", joined);
  }
  return base.toString();
}

// Generate Google Maps route with waypoints
router.post("/", (req, res) => {
  const { start, end, waypoints, format, travelmode } = req.body;

  if (!start || !end) {
    return res.status(400).json({ error: "Start and end required" });
  }

  const normalizedWps = normalizeWaypoints(waypoints);
  const fmt = (format || "path").toString().toLowerCase(); // 'path' | 'api'
  const mode = (travelmode || "driving").toString().toLowerCase(); // driving|walking|bicycling|transit

  let routeUrl;
  if (fmt === "api") {
    routeUrl = buildApiUrl(start, end, normalizedWps, mode);
  } else {
    routeUrl = buildPathUrl(start, end, normalizedWps);
  }

  res.json({ routeUrl, meta: { format: fmt, travelmode: mode, waypoints: normalizedWps } });
});

module.exports = router;
