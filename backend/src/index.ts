import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import { Worker } from "./worker.js";
import { youtubeRoute } from "./routes/youtube.js";
import { stripeRoute } from "./routes/stripe.js";
import { adminSettingsRoute } from "./routes/admin-settings.js";
import { generateSignedUrl } from "./services/storage.js";
import { register, httpRequestsTotal, httpRequestDuration } from "./services/metrics.js";
import { VALID_SUBTITLE_PRESETS, VALID_WORD_EFFECT_MODES } from "./services/subtitles.js";

const requiredEnv = [
  "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "GROQ_API_KEY", "UNREALSPEECH_API_KEY",
  "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET",
];
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

app.use("/api/stripe/webhook", express.raw({ type: "application/json" }));
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

const voiceDemoLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many demo requests, please slow down" },
});
const voiceBatchDemoLimiter = rateLimit({
  windowMs: 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many batch demo requests, please slow down" },
});

const VALID_VOICES = new Set([
  "Autumn", "Melody", "Hannah", "Emily", "Ivy", "Kaitlyn", "Luna", "Willow", "Lauren", "Sierra",
  "Noah", "Jasper", "Caleb", "Ronan", "Ethan", "Daniel", "Zane",
  "Mei", "Lian", "Ting", "Jing", "Wei", "Jian", "Hao", "Sheng",
  "Lucía", "Mateo", "Javier", "Élodie", "Ananya", "Priya", "Arjun", "Rohan", "Giulia", "Luca", "Camila", "Thiago", "Rafael",
]);

const ALL_VOICES = Array.from(VALID_VOICES);
const VOICE_DEMO_CACHE_TTL_MS = 10 * 60 * 1000;
const voiceDemoCache = new Map<string, { url: string; cachedAt: number }>();

function randomVoiceDemoScript(): string {
  const openers = [
    "What if one tiny habit changed everything?",
    "Most people miss this simple daily trick.",
    "Here is a quick mindset shift that works.",
    "Try this small change for better focus.",
  ];
  const middles = [
    "Set one clear goal before you start your day, and remove one distraction.",
    "Write your top priority in one sentence, then work in short focused blocks.",
    "Pick one important task, do it first, and protect your attention for fifteen minutes.",
    "Start with the hardest task, keep your phone away, and track one small win.",
  ];
  const closers = [
    "Do this today, and you will feel the difference by tonight.",
    "Repeat this for a week, and your progress will be obvious.",
    "Keep it simple, stay consistent, and results will follow.",
    "Save this idea and test it in your next work session.",
  ];
  const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
  return `${pick(openers)} ${pick(middles)} ${pick(closers)}`;
}

async function synthesizeVoiceSample(text: string, voice: string): Promise<string> {
  const apiKey = process.env.UNREALSPEECH_API_KEY || "";
  const auth = apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}`;
  const response = await fetch("https://api.v8.unrealspeech.com/speech", {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Text: text,
      VoiceId: voice,
      Bitrate: "192k",
      Speed: 0,
      Pitch: 1.0,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "Unknown error");
    throw new Error(`Voice demo failed (${voice}): ${response.status} - ${err}`);
  }

  const data = await response.json();
  if (!data?.OutputUri) throw new Error(`Voice demo URL missing for ${voice}`);
  return data.OutputUri as string;
}

async function getCachedVoiceDemo(voice: string): Promise<string> {
  const cached = voiceDemoCache.get(voice);
  if (cached && Date.now() - cached.cachedAt < VOICE_DEMO_CACHE_TTL_MS) {
    return cached.url;
  }
  const demoText = "Quick voice preview for your video.";
  const url = await synthesizeVoiceSample(demoText, voice);
  voiceDemoCache.set(voice, { url, cachedAt: Date.now() });
  return url;
}

app.use("/api", youtubeRoute);
app.use("/api", stripeRoute);
app.use("/api", adminSettingsRoute);

app.get("/api/voice-demo", voiceDemoLimiter, async (req, res) => {
  const rawVoice = req.query.voice;
  const voice = typeof rawVoice === "string" ? rawVoice : "";
  if (!voice || !VALID_VOICES.has(voice)) {
    res.status(400).json({ error: "Invalid voice" });
    return;
  }

  try {
    const url = await getCachedVoiceDemo(voice);
    res.json({ url });
  } catch {
    res.status(500).json({ error: "Failed to generate voice demo" });
  }
});

app.post("/api/voice-demos/generate", voiceBatchDemoLimiter, async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const token = authHeader.slice(7);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    res.status(401).json({ error: "Invalid token" });
    return;
  }

  const script = randomVoiceDemoScript();
  const demos: Array<{ voice: string; url: string | null; error?: string }> = [];

  // Process sequentially to keep provider rate pressure predictable.
  for (const voice of ALL_VOICES) {
    try {
      const url = await synthesizeVoiceSample(script, voice);
      demos.push({ voice, url });
    } catch (err) {
      demos.push({
        voice,
        url: null,
        error: err instanceof Error ? err.message : "Failed",
      });
    }
  }

  res.json({ script, demos });
});

app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

app.get("/metrics", async (_req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// --- Demo videos (public, cached) ---

let demoCache: { data: { id: string; topic: string; voice: string }[]; ts: number } | null = null;
const DEMO_CACHE_TTL_MS = 5 * 60_000;

app.get("/api/demo/videos", async (_req, res) => {
  try {
    if (demoCache && Date.now() - demoCache.ts < DEMO_CACHE_TTL_MS) {
      res.set("Cache-Control", "public, max-age=300");
      res.json({ videos: demoCache.data });
      return;
    }
    const { data } = await supabase
      .from("jobs")
      .select("id, topic, voice")
      .eq("status", "completed")
      .eq("is_demo", true)
      .order("created_at", { ascending: false })
      .limit(6);
    const videos = (data || []).map((j: { id: string; topic: string; voice: string }) => ({
      id: j.id, topic: j.topic, voice: j.voice,
    }));
    demoCache = { data: videos, ts: Date.now() };
    res.set("Cache-Control", "public, max-age=300");
    res.json({ videos });
  } catch {
    res.json({ videos: [] });
  }
});

const demoMediaLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests" },
});

const demoSignedUrlCache = new Map<string, { url: string; ts: number }>();
const DEMO_SIGNED_URL_TTL_MS = 6 * 24 * 3600_000; // refresh 1 day before expiry

app.get("/api/demo/media/:jobId/:type", demoMediaLimiter, async (req, res) => {
  const { jobId, type } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId as string)) { res.status(400).json({ error: "Invalid ID" }); return; }
  if (type !== "video" && type !== "thumb") { res.status(400).json({ error: "Type must be video or thumb" }); return; }

  const cacheKey = `${jobId}:${type}`;
  const cached = demoSignedUrlCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < DEMO_SIGNED_URL_TTL_MS) {
    res.redirect(302, cached.url);
    return;
  }

  try {
    const { data: job } = await supabase
      .from("jobs")
      .select("id, is_demo, is_guest")
      .eq("id", jobId)
      .single();

    if (!job || (!job.is_demo && !job.is_guest)) { res.status(404).json({ error: "Not found" }); return; }

    const file = type === "video" ? "video.mp4" : "thumb.jpg";
    const url = await generateSignedUrl(`jobs/${jobId}/${file}`);
    demoSignedUrlCache.set(cacheKey, { url, ts: Date.now() });
    res.redirect(302, url);
  } catch {
    res.status(500).json({ error: "Failed to generate URL" });
  }
});

// Admin: set/unset a job as demo
app.patch("/api/admin/jobs/:jobId/demo", async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) { res.status(401).json({ error: "Unauthorized" }); return; }
  const token = authHeader.slice(7);
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) { res.status(401).json({ error: "Invalid token" }); return; }
  const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).single();
  if (!profile?.is_admin) { res.status(403).json({ error: "Admin only" }); return; }

  const { is_demo } = req.body || {};
  const jobId = req.params.jobId as string;
  const { error } = await supabase.from("jobs").update({ is_demo: !!is_demo }).eq("id", jobId);
  if (error) { res.status(500).json({ error: error.message }); return; }
  demoCache = null;
  res.json({ success: true });
});

const guestLimiter = rateLimit({
  windowMs: 10 * 60_000,
  max: 1,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "You can try one free video every 10 minutes." },
});

const GUEST_VALID_VOICES = new Set([
  "Autumn", "Melody", "Hannah", "Emily", "Ivy", "Kaitlyn", "Luna", "Willow", "Lauren", "Sierra",
  "Noah", "Jasper", "Caleb", "Ronan", "Ethan", "Daniel", "Zane",
]);

app.post("/api/guest/generate", guestLimiter, async (req, res) => {
  const {
    topic,
    voice = "Noah",
    background = "minecraft",
    subtitle_preset = "classic",
    word_effect_mode = "combo",
  } = req.body || {};

  if (!topic || typeof topic !== "string" || !topic.trim()) {
    res.status(400).json({ error: "Topic is required" });
    return;
  }
  if (!GUEST_VALID_VOICES.has(voice)) {
    res.status(400).json({ error: "Invalid voice" });
    return;
  }
  if (subtitle_preset && !VALID_SUBTITLE_PRESETS.has(subtitle_preset)) {
    res.status(400).json({ error: "Invalid subtitle preset" });
    return;
  }
  if (word_effect_mode && !VALID_WORD_EFFECT_MODES.has(word_effect_mode)) {
    res.status(400).json({ error: "Invalid word effect mode" });
    return;
  }

  try {
    const { data: job, error: insertErr } = await supabase
      .from("jobs")
      .insert({
        user_id: null,
        topic: topic.trim().slice(0, 500),
        duration: 30,
        voice,
        background,
        subtitle_preset: subtitle_preset || "classic",
        word_effect_mode: word_effect_mode || "combo",
        status: "pending",
        is_guest: true,
      })
      .select()
      .single();

    if (insertErr || !job) {
      res.status(500).json({ error: "Failed to create guest job" });
      return;
    }

    res.json({ jobId: job.id });
  } catch {
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/guest/job/:jobId", async (req, res) => {
  const { jobId } = req.params;
  if (!/^[0-9a-f-]{36}$/i.test(jobId as string)) {
    res.status(400).json({ error: "Invalid job ID" });
    return;
  }
  const { data: job } = await supabase
    .from("jobs")
    .select("id, status, error, video_url, thumbnail_url, script")
    .eq("id", jobId)
    .eq("is_guest", true)
    .single();

  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(job);
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
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const token = authHeader.slice(7);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      res.status(401).json({ error: "Invalid token" });
      return;
    }

    const { data: job } = await supabase
      .from("jobs")
      .select("user_id")
      .eq("id", jobId)
      .single();

    if (!job || job.user_id !== user.id) {
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
