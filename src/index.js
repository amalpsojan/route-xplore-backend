const express = require("express");
const placesRouter = require("./routes/places");

const app = express();
const PORT = 5000;

app.use(express.json());
app.use("/api/places", placesRouter);

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
