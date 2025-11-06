// server/index.js
import express from "express";
import cors from "cors";

import config from "./config.js";
import analyzeRoutes from "./routes/analyze.js";
import clusterRoutes from "./routes/clusterSegments.js";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/", (req, res) => {
  res.send("Tandem backend running (OpenAI only).");
});

app.use(analyzeRoutes);
app.use(clusterRoutes);

app.listen(config.port, () =>
  console.log(`Backend running on port ${config.port} (OpenAI only)`)
);