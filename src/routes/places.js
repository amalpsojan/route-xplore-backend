const express = require("express");
const axios = require("axios");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    // Example: Thrissur to Kochi bounding box
    const query = `
      [out:json][timeout:25];
      (
        node["tourism"](10.3,76.0,10.7,76.5);
        way["tourism"](10.3,76.0,10.7,76.5);
        relation["tourism"](10.3,76.0,10.7,76.5);
      );
      out center;
    `;

    const response = await axios({
      method: "POST",
      url: "https://overpass-api.de/api/interpreter",
      headers: { "Content-Type": "text/plain" },
      data: query, // send raw query text
    });

    res.json(response.data);
  } catch (error) {
    console.error(error.response?.data || error.message);
    res.status(500).json({ error: "Failed to fetch tourist places" });
  }
});

module.exports = router;
