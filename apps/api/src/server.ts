import express from "express";

const app = express();
const port = Number(process.env.API_PORT ?? "4000");

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(port, () => {
  console.log(`API server running on :${port}`);
});
