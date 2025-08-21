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

router.get("/", async (req, res) => {
  try {
    const { start, end, padding } = req.query;

    const startCoord = parseLatLng(start);
    const endCoord = parseLatLng(end);

    if (!startCoord || !endCoord) {
      return res.status(400).json({
        error: "Invalid or missing start/end. Use 'start=lat,lng&end=lat,lng'",
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

    const query = `
      [out:json][timeout:25];
      (
        node["tourism"](${south},${west},${north},${east});
        way["tourism"](${south},${west},${north},${east});
        relation["tourism"](${south},${west},${north},${east});
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

    res.json({
      bbox: { south, west, north, east },
      start: startCoord,
      end: endCoord,
      data: response.data,
    });
  } catch (error) {
    const errMsg = error.response?.data || error.message || "Unknown error";
    console.error(errMsg);
    res.status(500).json({ error: "Failed to fetch tourist places" });
  }
});

module.exports = router;
