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

export const youtubeRoute = Router();

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
      "--tmp-dir", ytDownloadDir,
    ], {
      cwd: CWD,
      env: {
        ...process.env,
        YT_TMPDIR: ytDownloadDir,
        TMPDIR: ytDownloadDir,
      },
    });

    let output = "";

    proc.stdout.on("data", (data: Buffer) => {
      const lines = data.toString().split("\n").filter(Boolean);
      for (const line of lines) {
        output = line;
        try {
          const parsed = JSON.parse(line);
          res.write(`data: ${JSON.stringify(parsed)}\n\n`);
        } catch {
          res.write(`data: ${JSON.stringify({ step: line })}\n\n`);
        }
      }
    });

    proc.stderr.on("data", (data: Buffer) => {
      console.error("yt_download stderr:", data.toString());
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        try {
          const parsed = JSON.parse(output);
          if (parsed.error) {
            res.write(`data: ${JSON.stringify({ error: parsed.error })}\n\n`);
          } else {
            res.write(`data: ${JSON.stringify({ error: "Download failed" })}\n\n`);
          }
        } catch {
          res.write(`data: ${JSON.stringify({ error: "Download process failed" })}\n\n`);
        }
      }
      res.end();
    });

    proc.on("error", (err) => {
      res.write(`data: ${JSON.stringify({ error: `Failed to start: ${err.message}` })}\n\n`);
      res.end();
    });

    req.on("close", () => {
      if (!proc.killed) proc.kill("SIGTERM");
    });
  }
);
