import { createClient, SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import { generateStory } from "./services/story.js";
import { generateVoice, timeStretchAudio, scaleTimestamps } from "./services/voice.js";
import { generateSubtitles } from "./services/subtitles.js";
import { assembleVideo } from "./services/video.js";
import { uploadFile } from "./services/storage.js";
import { jobsProcessedTotal, jobDurationSeconds, jobsInProgress } from "./services/metrics.js";
import fs from "fs";
import path from "path";

const GENERATED_DIR = path.resolve(process.cwd(), "generated");
const MAX_CONCURRENT_JOBS = parseInt(process.env.MAX_CONCURRENT_JOBS || "2", 10);
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || "10000", 10);

interface Job {
  id: string;
  user_id: string;
  status: string;
  topic: string;
  duration: 30 | 60;
  voice: string;
  background: string;
  script: string | null;
  audio_url: string | null;
  subtitles_url: string | null;
  video_url: string | null;
  error: string | null;
}

const VALID_VOICES = new Set([
  "Autumn", "Melody", "Hannah", "Emily", "Ivy", "Kaitlyn", "Luna", "Willow", "Lauren", "Sierra",
  "Noah", "Jasper", "Caleb", "Ronan", "Ethan", "Daniel", "Zane",
  "Mei", "Lian", "Ting", "Jing", "Wei", "Jian", "Hao", "Sheng",
  "Lucía", "Mateo", "Javier", "Élodie",
  "Ananya", "Priya", "Arjun", "Rohan",
  "Giulia", "Luca", "Camila", "Thiago", "Rafael",
]);

function validateJob(job: Job): string | null {
  if (!job.topic || job.topic.length > 500) return "Invalid topic";
  if (![30, 60].includes(job.duration)) return "Duration must be 30 or 60";
  if (!VALID_VOICES.has(job.voice)) return `Invalid voice: ${job.voice}`;
  if (!job.background || !/^[a-z0-9-]+$/i.test(job.background)) return "Invalid background category";
  return null;
}

export class Worker {
  private supabase: SupabaseClient;
  private channel: RealtimeChannel | null = null;
  private processing = new Set<string>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor() {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
    }
    this.supabase = createClient(url, key);
  }

  async start(): Promise<void> {
    this.stopped = false;
    console.log(`Worker starting (max concurrent: ${MAX_CONCURRENT_JOBS})...`);

    fs.mkdirSync(GENERATED_DIR, { recursive: true });

    await this.recoverInterruptedJobs();
    await this.pollPendingJobs();
    this.subscribeRealtime();

    this.pollTimer = setInterval(() => {
      this.pollPendingJobs();
    }, POLL_INTERVAL_MS);

    console.log("Worker ready and listening for jobs.");
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
    }
    console.log("Worker stopped.");
  }

  private subscribeRealtime(): void {
    try {
      this.channel = this.supabase
        .channel("jobs-worker")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "jobs" },
          (payload) => {
            const job = payload.new as Job;
            if (job.status === "pending") {
              console.log(`[realtime] New job: ${job.id}`);
              this.tryProcessJob(job);
            }
          }
        )
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") {
            console.log("Realtime: connected");
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            console.warn(`Realtime: ${status} (${err?.message || "unknown"}) — polling is active as fallback`);
            setTimeout(() => {
              if (!this.stopped) {
                if (this.channel) {
                  this.supabase.removeChannel(this.channel).catch(() => {});
                  this.channel = null;
                }
                this.subscribeRealtime();
              }
            }, 10_000);
          }
        });
    } catch (err) {
      console.warn("Realtime subscription error:", err);
    }
  }

  private async pollPendingJobs(): Promise<void> {
    if (this.processing.size >= MAX_CONCURRENT_JOBS) return;

    const { data: pending, error } = await this.supabase
      .from("jobs")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(MAX_CONCURRENT_JOBS - this.processing.size);

    if (error) {
      console.error("Poll failed:", error.message);
      return;
    }

    for (const job of (pending || []) as Job[]) {
      this.tryProcessJob(job);
    }
  }

  private async updateJob(jobId: string, updates: Partial<Job>): Promise<void> {
    const { error } = await this.supabase
      .from("jobs")
      .update(updates)
      .eq("id", jobId);

    if (error) {
      console.error(`Failed to update job ${jobId}:`, error.message);
      throw new Error(`DB update failed: ${error.message}`);
    }
  }

  private async recoverInterruptedJobs(): Promise<void> {
    const { data: interrupted, error } = await this.supabase
      .from("jobs")
      .select("*")
      .not("status", "in", '("completed","failed","pending")')
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Recovery query failed:", error.message);
      return;
    }

    if (!interrupted || interrupted.length === 0) {
      console.log("No interrupted jobs to recover.");
      return;
    }

    console.log(`Recovering ${interrupted.length} interrupted job(s)...`);
    for (const job of interrupted as Job[]) {
      this.tryProcessJob(job);
    }
  }

  private tryProcessJob(job: Job): void {
    if (this.processing.has(job.id)) return;
    if (this.processing.size >= MAX_CONCURRENT_JOBS) {
      console.log(`Job ${job.id}: queued (at capacity ${this.processing.size}/${MAX_CONCURRENT_JOBS})`);
      return;
    }
    this.processJob(job);
  }

  private async processJob(job: Job): Promise<void> {
    if (this.processing.has(job.id)) return;
    this.processing.add(job.id);
    jobsInProgress.inc();

    const t0 = Date.now();
    console.log(`[${job.id}] START: "${job.topic}" (${job.duration}s, ${job.voice}, bg:${job.background})`);

    try {
      const validationError = validateJob(job);
      if (validationError) {
        await this.updateJob(job.id, { status: "failed", error: validationError });
        return;
      }

      let { script } = job;

      // Step 1: Generate script
      if (!script) {
        await this.updateJob(job.id, { status: "generating_script" });
        script = await generateStory(job.topic, job.duration);
        await this.updateJob(job.id, { script });
        console.log(`[${job.id}] Script: ${script.split(/\s+/).length} words`);
      }

      // Step 2: Generate voice
      await this.updateJob(job.id, { status: "generating_voice" });
      const voiceResult = await generateVoice(script, job.voice, job.id);
      let audioPath = voiceResult.audioPath;
      let timestamps = voiceResult.timestamps;

      // Step 3: Time-stretch audio
      await this.updateJob(job.id, { status: "fitting_audio" });
      const { stretchedPath, tempoFactor } = timeStretchAudio(
        audioPath,
        job.duration,
        voiceResult.audioDuration,
        job.id
      );
      audioPath = stretchedPath;
      timestamps = scaleTimestamps(timestamps, tempoFactor);

      // Step 4: Build subtitles
      await this.updateJob(job.id, { status: "building_subtitles" });
      const assPath = await generateSubtitles(timestamps, job.id);

      // Step 5: Assemble video
      await this.updateJob(job.id, { status: "assembling_video" });
      const videoFilename = await assembleVideo({
        audioPath,
        assPath,
        background: job.background,
        duration: job.duration,
        jobId: job.id,
      });

      // Step 6: Upload ALL files to B2 at once
      await this.updateJob(job.id, { status: "uploading" });
      const localVideoPath = path.join(GENERATED_DIR, videoFilename);

      console.log(`[${job.id}] Uploading all assets to B2...`);
      const [audio_url, subtitles_url, video_url] = await Promise.all([
        uploadFile(audioPath, `jobs/${job.id}/audio.mp3`),
        uploadFile(assPath, `jobs/${job.id}/subtitles.ass`),
        uploadFile(localVideoPath, `jobs/${job.id}/video.mp4`),
      ]);

      await this.updateJob(job.id, {
        status: "completed",
        audio_url,
        subtitles_url,
        video_url,
      });

      const elapsedSec = (Date.now() - t0) / 1000;
      const elapsed = elapsedSec.toFixed(1);
      jobsProcessedTotal.inc({ status: "completed" });
      jobDurationSeconds.observe({ status: "completed", duration_type: `${job.duration}s` }, elapsedSec);
      console.log(`[${job.id}] COMPLETED in ${elapsed}s — ${video_url}`);

      // Upload confirmed — remove all local files for this job
      cleanupLocalFiles(job.id, GENERATED_DIR);
      console.log(`[${job.id}] Local files cleaned up`);
    } catch (err) {
      const rawMessage = err instanceof Error ? err.message : "Unknown error";
      console.error(`[${job.id}] FAILED:`, rawMessage);
      const safeError = sanitizeErrorMessage(rawMessage);
      jobsProcessedTotal.inc({ status: "failed" });
      jobDurationSeconds.observe({ status: "failed", duration_type: `${job.duration}s` }, (Date.now() - t0) / 1000);
      try {
        await this.updateJob(job.id, { status: "failed", error: safeError });
      } catch {
        console.error(`[${job.id}] Could not mark as failed in DB`);
      }
      // Also clean up on failure — no reason to keep partial local artifacts
      cleanupLocalFiles(job.id, GENERATED_DIR);
    } finally {
      jobsInProgress.dec();
      this.processing.delete(job.id);
      if (!this.stopped) this.pollPendingJobs();
    }
  }
}

function sanitizeErrorMessage(raw: string): string {
  const safePatterns: Record<string, string> = {
    "Unreal Speech API error": "Voice generation failed",
    "OpenRouter": "Script generation failed",
    "Upload failed": "Cloud upload failed",
    "ffprobe": "Audio processing failed",
    "FFmpeg": "Video processing failed",
    "ENOENT": "File processing error",
  };
  for (const [pattern, replacement] of Object.entries(safePatterns)) {
    if (raw.includes(pattern)) return replacement;
  }
  if (raw.length > 200) return raw.slice(0, 200);
  return raw;
}

function cleanupLocalFiles(jobId: string, dir: string): void {
  const resolvedDir = path.resolve(dir);
  const suffixes = [".mp3", "_stretched.mp3", ".ass", ".mp4"];
  for (const suffix of suffixes) {
    const filePath = path.resolve(dir, `${jobId}${suffix}`);
    if (!filePath.startsWith(resolvedDir)) continue;
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // best-effort
    }
  }
}
