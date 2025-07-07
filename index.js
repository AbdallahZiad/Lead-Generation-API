const express = require("express");
const cors = require("cors");
require("dotenv").config();

const googleScraper = require("./scrapers/google");
const fgas = require("./scrapers/fgas.js");
const refcomScraper = require("./scrapers/refcom");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Scraper API is running.");
});

app.post("/scrape/google", googleScraper);
app.post("/scrape/fgas", fgas);
app.post("/scrape/refcom", refcomScraper);

// catch errors
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
