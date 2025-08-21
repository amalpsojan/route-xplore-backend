const express = require("express");
const router = express.Router();

// Parse Google Maps link to extract start & end
router.post("/", (req, res) => {
  const { link } = req.body;

  if (!link) {
    return res.status(400).json({ error: "No link provided" });
  }

  // Example: https://www.google.com/maps/dir/Thrissur/Kochi
  const match = link.match(/\/dir\/([^/]+)\/([^/]+)/);

  if (!match) {
    return res.status(400).json({ error: "Invalid Google Maps link" });
  }

  const start = decodeURIComponent(match[1]);
  const end = decodeURIComponent(match[2]);

  res.json({ start, end });
});

module.exports = router;
