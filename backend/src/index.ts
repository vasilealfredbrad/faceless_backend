import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import { Worker } from "./worker.js";
import { youtubeRoute } from "./routes/youtube.js";
import { generateSignedUrl } from "./services/storage.js";
import { register, httpRequestsTotal, httpRequestDuration } from "./services/metrics.js";

const requiredEnv = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "OPENROUTER_API_KEY", "UNREALSPEECH_API_KEY"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required env var: ${key}`);
    process.exit(1);
  }
}

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const worker = new Worker();

const app = express();

app.use(helmet());

const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:5173")
  .split(",")
  .map(s => s.trim())
  .filter(s => s !== "*");

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  const end = httpRequestDuration.startTimer({ method: req.method, route: req.route?.path || req.path });
  res.on("finish", () => {
    httpRequestsTotal.inc({ method: req.method, route: req.route?.path || req.path, status_code: res.statusCode });
    end();
  });
  next();
});

const globalLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later" },
});
app.use(globalLimiter);

const signedUrlLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many URL requests, please slow down" },
});

app.use("/api", youtubeRoute);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.get("/api/signed-url/:jobId/:file", signedUrlLimiter, async (req, res) => {
  const jobId = req.params.jobId as string;
  const file = req.params.file as string;
  const allowed = ["video.mp4", "audio.mp3", "subtitles.ass"];
  if (!allowed.includes(file)) {
    res.status(400).json({ error: "Invalid file type" });
    return;
  }
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }

  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (!authErr && user) {
        const { data: job } = await supabase
          .from("jobs")
          .select("user_id, status")
          .eq("id", jobId)
          .single();

        if (job?.user_id === user.id || job?.status === "completed") {
          const url = await generateSignedUrl(`jobs/${jobId}/${file}`);
          res.json({ url });
          return;
        }
      }
    }

    const { data: job } = await supabase
      .from("jobs")
      .select("status")
      .eq("id", jobId)
      .single();

    if (job?.status !== "completed") {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    const url = await generateSignedUrl(`jobs/${jobId}/${file}`);
    res.json({ url });
  } catch {
    res.status(500).json({ error: "Failed to generate URL" });
  }
});

const PORT = parseInt(process.env.PORT || "3000", 10);

const server = app.listen(PORT, () => {
  console.log(`Admin API listening on port ${PORT}`);
});

process.on("SIGINT", async () => {
  server.close();
  await worker.stop();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  server.close();
  await worker.stop();
  process.exit(0);
});

process.on("unhandledRejection", (reason) => {
  const msg = reason instanceof Error ? reason.message : "Unknown rejection";
  console.error("Unhandled rejection:", msg);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err.message);
  process.exit(1);
});

worker.start().catch((err) => {
  console.error("Worker failed to start:", err.message);
  process.exit(1);
});
