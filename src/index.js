const express = require("express");
const cors = require("cors");
require("dotenv").config();

const placesRouter = require("./routes/places");
const linkRouter = require("./routes/link");
const routeRouter = require("./routes/route");
const detailsRouter = require("./routes/details");

const app = express();
const PORT = process.env.PORT || 5050;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/places", placesRouter);
app.use("/api/parse-link", linkRouter);
app.use("/api/generate-route", routeRouter);
app.use("/api/place-details", detailsRouter);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
