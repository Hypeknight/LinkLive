import express from "express";
const router = express.Router();

router.get("/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "admin-system",
    timestamp: new Date().toISOString()
  });
});

export default router;
