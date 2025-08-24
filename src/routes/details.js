const express = require("express");
const axios = require("axios");

const router = express.Router();

function parseWikipediaParam(wikipediaParam) {
  if (!wikipediaParam || typeof wikipediaParam !== "string") return null;
  const parts = wikipediaParam.split(":");
  if (parts.length >= 2) {
    const lang = parts[0].trim() || "en";
    const title = parts.slice(1).join(":").trim();
    if (!title) return null;
    return { lang, title };
  }
  // If only title provided without lang, default to en
  return { lang: "en", title: wikipediaParam.trim() };
}

async function resolveWikidataToWikipediaTitle(wikidataId) {
  try {
    const url = `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(wikidataId)}.json`;
    const resp = await axios.get(url, {
      headers: {
        "User-Agent": "RouteXplore/1.0 (contact: example@routexplore.app)",
        Accept: "application/json",
      },
      timeout: 10000,
    });
    const entities = resp.data?.entities || {};
    const entity = entities[wikidataId];
    const sitelinks = entity?.sitelinks || {};
    // Prefer enwiki, else any *wiki
    const preferred = sitelinks.enwiki || Object.values(sitelinks).find((s) => s.site?.endsWith("wiki"));
    if (!preferred?.title) return null;
    const lang = preferred.site.replace("wiki", "");
    return { lang, title: preferred.title };
  } catch (_) {
    return null;
  }
}

async function fetchWikipediaSummary(lang, title) {
  const base = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const resp = await axios.get(base, {
    headers: {
      "User-Agent": "RouteXplore/1.0 (contact: example@routexplore.app)",
      Accept: "application/json",
    },
    timeout: 10000,
    validateStatus: () => true,
  });
  if (resp.status >= 400) {
    return null;
  }
  const d = resp.data || {};
  return {
    title: d.title || title,
    extract: d.extract || null,
    description: d.description || null,
    thumbnail: d.thumbnail?.source || d.originalimage?.source || null,
    content_urls: d.content_urls || null,
    lang,
    page_url: d.content_urls?.desktop?.page || `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`,
  };
}

// GET /api/place-details?wikipedia=en:Page_Title
// or /api/place-details?title=Page%20Title&lang=en
// or /api/place-details?wikidata=QXXXXX
router.get("/", async (req, res) => {
  try {
    const { wikipedia, title, lang, wikidata } = req.query;

    let resolved = null;
    if (typeof wikipedia === "string" && wikipedia.trim().length > 0) {
      resolved = parseWikipediaParam(wikipedia.trim());
    } else if (typeof title === "string" && title.trim().length > 0) {
      resolved = { lang: (lang || "en").trim(), title: title.trim() };
    } else if (typeof wikidata === "string" && wikidata.trim().length > 0) {
      resolved = await resolveWikidataToWikipediaTitle(wikidata.trim());
      if (!resolved) {
        return res.status(404).json({ error: "Could not resolve Wikidata ID to a Wikipedia title" });
      }
    } else {
      return res.status(400).json({ error: "Provide one of: wikipedia, or title (+optional lang), or wikidata" });
    }

    const details = await fetchWikipediaSummary(resolved.lang, resolved.title);
    if (!details) {
      return res.status(404).json({ error: "No Wikipedia summary found", meta: resolved });
    }
    return res.json({
      wikipedia: `${resolved.lang}:${resolved.title}`,
      ...details,
      wikidata: typeof req.query.wikidata === "string" ? req.query.wikidata.trim() : undefined,
    });
  } catch (error) {
    const message = error?.message || "Unknown error";
    console.error(message);
    return res.status(500).json({ error: "Failed to fetch place details" });
  }
});

module.exports = router;


