import { Router, Request, Response, NextFunction } from "express";
import { spawn } from "child_process";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import fs from "fs";

const CWD = process.cwd();
const SCRIPTS_DIR = path.resolve(CWD, "scripts");
const VIDEOS_DIR = path.resolve(CWD, "videos");

const supabase = createClient(
  process.env.SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

function findPython(): string {
  const venvPython = path.resolve(CWD, "python-env/bin/python3");
  if (fs.existsSync(venvPython)) return venvPython;
  return "python3";
}

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing authorization token" });
    return;
  }

  const token = authHeader.slice(7);

  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      res.status(401).json({ error: "Invalid or expired token" });
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_admin) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }

    next();
  } catch {
    res.status(500).json({ error: "Authentication check failed" });
  }
}

interface ClipMeta {
  filename: string;
  clip_path: string;
  start_time: number;
  duration: number;
}

interface DownloadResult {
  count: number;
  files: string[];
  clips: ClipMeta[];
  source_path: string | null;
  title: string | null;
  youtube_id: string | null;
  duration_seconds: number | null;
}

async function saveSourceVideo(
  url: string, category: string, result: DownloadResult
): Promise<void> {
  try {
    const { data: sv, error: svErr } = await supabase
      .from("source_videos")
      .insert({
        youtube_url: url,
        youtube_id: result.youtube_id,
        title: result.title,
        category,
        source_path: result.source_path,
        duration_seconds: result.duration_seconds,
        status: "ready",
      })
      .select("id")
      .single();

    if (svErr || !sv) {
      console.error("Failed to insert source_video:", svErr?.message);
      return;
    }

    if (result.clips && result.clips.length > 0) {
      const clipRows = result.clips.map((c) => ({
        source_video_id: sv.id,
        clip_path: c.clip_path,
        clip_duration: c.duration,
        start_time: c.start_time,
        filename: c.filename,
      }));

      const { error: clErr } = await supabase
        .from("source_clips")
        .insert(clipRows);

      if (clErr) {
        console.error("Failed to insert source_clips:", clErr.message);
      }
    }
  } catch (err) {
    console.error("saveSourceVideo error:", err);
  }
}

async function saveReprocessClips(
  sourceVideoId: string, clips: ClipMeta[]
): Promise<void> {
  try {
    if (!clips || clips.length === 0) return;
    const clipRows = clips.map((c) => ({
      source_video_id: sourceVideoId,
      clip_path: c.clip_path,
      clip_duration: c.duration,
      start_time: c.start_time,
      filename: c.filename,
    }));

    const { error } = await supabase
      .from("source_clips")
      .insert(clipRows);

    if (error) {
      console.error("Failed to insert reprocess clips:", error.message);
    }
  } catch (err) {
    console.error("saveReprocessClips error:", err);
  }
}

export const youtubeRoute = Router();

// ---- List categories from disk ----

youtubeRoute.get("/youtube/categories", (_req, res) => {
  try {
    const categories: { name: string; clips30: number; clips60: number }[] = [];
    if (!fs.existsSync(VIDEOS_DIR)) {
      res.json({ categories });
      return;
    }
    const dirs = fs
      .readdirSync(VIDEOS_DIR)
      .filter((d) => {
        try {
          return fs.statSync(path.join(VIDEOS_DIR, d)).isDirectory();
        } catch {
          return false;
        }
      });

    for (const dir of dirs) {
      if (!/^[a-z0-9-]+$/i.test(dir)) continue;

      const dir30 = path.join(VIDEOS_DIR, dir, "30");
      const dir60 = path.join(VIDEOS_DIR, dir, "60");
      const count = (d: string) => {
        try {
          return fs.existsSync(d)
            ? fs.readdirSync(d).filter((f) => /\.(mp4|mov|webm|avi|mkv)$/i.test(f)).length
            : 0;
        } catch {
          return 0;
        }
      };
      categories.push({
        name: dir,
        clips30: count(dir30),
        clips60: count(dir60),
      });
    }
    res.json({ categories });
  } catch {
    res.json({ categories: [] });
  }
});

// ---- List source videos from DB ----

youtubeRoute.get(
  "/youtube/sources",
  requireAdmin,
  async (_req: Request, res: Response) => {
    try {
      const { data: sources, error } = await supabase
        .from("source_videos")
        .select("*, source_clips(id, clip_duration, filename, start_time, times_used, created_at)")
        .order("created_at", { ascending: false });

      if (error) {
        res.status(500).json({ error: error.message });
        return;
      }

      res.json({ sources: sources || [] });
    } catch {
      res.status(500).json({ error: "Failed to fetch source videos" });
    }
  }
);

// ---- Download from YouTube ----

youtubeRoute.post(
  "/youtube/download",
  requireAdmin,
  async (req: Request, res: Response) => {
    const { url, category, duration, clips } = req.body;

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Missing or invalid url" });
      return;
    }

    if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(url)) {
      res.status(400).json({ error: "Invalid YouTube URL" });
      return;
    }

    if (!category || typeof category !== "string" || !/^[a-z0-9-]+$/i.test(category)) {
      res.status(400).json({ error: "Invalid category name (use lowercase letters, numbers, hyphens)" });
      return;
    }

    if (![30, 60].includes(duration)) {
      res.status(400).json({ error: "Duration must be 30 or 60" });
      return;
    }

    const numClips = Math.max(1, Math.min(20, parseInt(clips) || 5));

    const categoryDir = path.join(VIDEOS_DIR, category);
    fs.mkdirSync(path.join(categoryDir, "30"), { recursive: true });
    fs.mkdirSync(path.join(categoryDir, "60"), { recursive: true });

    // Insert a "downloading" record
    const { data: svRow } = await supabase
      .from("source_videos")
      .insert({
        youtube_url: url,
        category,
        status: "downloading",
      })
      .select("id")
      .single();

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const pythonBin = findPython();
    const scriptPath = path.join(SCRIPTS_DIR, "yt_download.py");

    const ytDownloadDir = path.resolve(CWD, "yt_download_raw");
    fs.mkdirSync(ytDownloadDir, { recursive: true });
    const proc = spawn(pythonBin, [
      scriptPath,
      "--url", url,
      "--category", category,
      "--duration", String(duration),
      "--clips", String(numClips),
      "--videos-dir", VIDEOS_DIR,
      "--download-dir", ytDownloadDir,
    ], {
      cwd: CWD,
      env: {
        ...process.env,
        YT_DOWNLOAD_DIR: ytDownloadDir,
      },
    });

    let lastOutput = "";
    let stdoutBuffer = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        lastOutput = line;
        try {
          const parsed = JSON.parse(line);
          if (parsed.step === "Cutting" || (parsed.step && parsed.step.includes("Cutting"))) {
            if (svRow?.id) {
              supabase.from("source_videos").update({ status: "cutting" }).eq("id", svRow.id).then(() => {});
            }
          }
          res.write(`data: ${JSON.stringify(parsed)}\n\n`);
        } catch {
          res.write(`data: ${JSON.stringify({ step: line })}\n\n`);
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      console.error("yt_download stderr:", data.toString());
    });

    proc.on("close", async (code) => {
      if (stdoutBuffer.trim()) lastOutput = stdoutBuffer.trim();
      if (code === 0) {
        try {
          const result: DownloadResult = JSON.parse(lastOutput);
          if (svRow?.id) {
            await supabase.from("source_videos").update({
              youtube_id: result.youtube_id,
              title: result.title,
              source_path: result.source_path,
              duration_seconds: result.duration_seconds,
              status: "ready",
            }).eq("id", svRow.id);

            if (result.clips && result.clips.length > 0) {
              await saveReprocessClips(svRow.id, result.clips);
            }
          } else {
            await saveSourceVideo(url, category, result);
          }
        } catch (e) {
          console.error("Failed to save source metadata:", e);
        }
      } else {
        let errorMsg = "Download process failed";
        try {
          const parsed = JSON.parse(lastOutput);
          if (parsed.error) errorMsg = parsed.error;
        } catch { /* ignore */ }

        if (svRow?.id) {
          await supabase.from("source_videos").update({
            status: "failed",
            error: errorMsg,
          }).eq("id", svRow.id);
        }

        res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      }
      res.end();
    });

    proc.on("error", async (err) => {
      if (svRow?.id) {
        await supabase.from("source_videos").update({
          status: "failed",
          error: err.message,
        }).eq("id", svRow.id);
      }
      res.write(`data: ${JSON.stringify({ error: `Failed to start: ${err.message}` })}\n\n`);
      res.end();
    });

    req.on("close", () => {
      if (!proc.killed) proc.kill("SIGTERM");
    });
  }
);

// ---- Reprocess an existing source video ----

youtubeRoute.post(
  "/youtube/reprocess/:sourceId",
  requireAdmin,
  async (req: Request, res: Response) => {
    const rawId = req.params.sourceId;
    const sourceId = typeof rawId === "string" ? rawId : (Array.isArray(rawId) ? rawId[0] : "") ?? "";
    const { duration, clips } = req.body;

    if (!/^[0-9a-f-]{36}$/i.test(sourceId)) {
      res.status(400).json({ error: "Invalid source ID" });
      return;
    }

    if (![30, 60].includes(duration)) {
      res.status(400).json({ error: "Duration must be 30 or 60" });
      return;
    }

    const numClips = Math.max(1, Math.min(20, parseInt(clips) || 5));

    const { data: source, error: fetchErr } = await supabase
      .from("source_videos")
      .select("*")
      .eq("id", sourceId)
      .single();

    if (fetchErr || !source) {
      res.status(404).json({ error: "Source video not found" });
      return;
    }

    if (source.status !== "ready") {
      res.status(400).json({ error: `Source video is not ready (status: ${source.status})` });
      return;
    }

    if (!source.source_path || !fs.existsSync(source.source_path)) {
      res.status(400).json({ error: "Source file not found on disk" });
      return;
    }

    await supabase.from("source_videos").update({ status: "cutting" }).eq("id", sourceId);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const pythonBin = findPython();
    const scriptPath = path.join(SCRIPTS_DIR, "yt_download.py");

    const proc = spawn(pythonBin, [
      scriptPath,
      "--input", source.source_path,
      "--category", source.category,
      "--duration", String(duration),
      "--clips", String(numClips),
      "--videos-dir", VIDEOS_DIR,
    ], {
      cwd: CWD,
      env: { ...process.env },
    });

    let lastOutput = "";
    let stdoutBuffer = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdoutBuffer += data.toString();
      const lines = stdoutBuffer.split("\n");
      stdoutBuffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        lastOutput = line;
        try {
          const parsed = JSON.parse(line);
          res.write(`data: ${JSON.stringify(parsed)}\n\n`);
        } catch {
          res.write(`data: ${JSON.stringify({ step: line })}\n\n`);
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      console.error("yt_reprocess stderr:", data.toString());
    });

    proc.on("close", async (code) => {
      if (stdoutBuffer.trim()) lastOutput = stdoutBuffer.trim();
      if (code === 0) {
        try {
          const result: DownloadResult = JSON.parse(lastOutput);
          await supabase.from("source_videos").update({ status: "ready" }).eq("id", sourceId);

          if (result.clips && result.clips.length > 0) {
            await saveReprocessClips(sourceId, result.clips);
          }
        } catch (e) {
          console.error("Failed to save reprocess metadata:", e);
        }
      } else {
        let errorMsg = "Reprocess failed";
        try {
          const parsed = JSON.parse(lastOutput);
          if (parsed.error) errorMsg = parsed.error;
        } catch { /* ignore */ }

        await supabase.from("source_videos").update({
          status: "ready",
          error: errorMsg,
        }).eq("id", sourceId);

        res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      }
      res.end();
    });

    proc.on("error", async (err) => {
      await supabase.from("source_videos").update({ status: "ready" }).eq("id", sourceId);
      res.write(`data: ${JSON.stringify({ error: `Failed to start: ${err.message}` })}\n\n`);
      res.end();
    });

    req.on("close", () => {
      if (!proc.killed) proc.kill("SIGTERM");
    });
  }
);
