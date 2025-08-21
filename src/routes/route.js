const express = require("express");
const router = express.Router();

// Generate Google Maps route with waypoints
router.post("/", (req, res) => {
  const { start, end, waypoints } = req.body;

  if (!start || !end) {
    return res.status(400).json({ error: "Start and end required" });
  }

  // Construct Google Maps URL
  let url = `https://www.google.com/maps/dir/${encodeURIComponent(start)}`;

  if (Array.isArray(waypoints) && waypoints.length > 0) {
    waypoints.forEach((wp) => {
      url += `/${encodeURIComponent(wp)}`;
    });
  }

  url += `/${encodeURIComponent(end)}`;

  res.json({ routeUrl: url });
});

module.exports = router;
