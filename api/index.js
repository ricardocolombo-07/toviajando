const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

app.get("/api/health", (req, res) => {
  res.json({ status: "OK", app: "TOVIAJANDO" });
});

app.get("/", (req, res) => {
  res.sendFile("index.html", { root: "public" });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 TOVIAJANDO em http://localhost:${PORT}`);
});

module.exports = app;