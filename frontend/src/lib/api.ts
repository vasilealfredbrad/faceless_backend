import { supabase } from "./supabase";

export interface GenerateRequest {
  topic: string;
  duration: 30 | 60;
  voice: string;
  background: string;
  variations?: number;
}

export interface GenerateResponse {
  jobId: string;
  videoUrl: string;
  script: string;
}

type JobStatus =
  | "pending"
  | "generating_script"
  | "generating_voice"
  | "fitting_audio"
  | "building_subtitles"
  | "assembling_video"
  | "uploading"
  | "completed"
  | "failed";

const STATUS_LABELS: Record<JobStatus, string> = {
  pending: "Queued...",
  generating_script: "Generating script with AI...",
  generating_voice: "Creating voiceover...",
  fitting_audio: "Fitting audio to exact duration...",
  building_subtitles: "Building subtitles...",
  assembling_video: "Assembling video...",
  uploading: "Uploading to cloud...",
  completed: "Done!",
  failed: "Failed",
};

export interface BulkProgress {
  completed: number;
  total: number;
  step: string;
}

export async function generateVideo(
  req: GenerateRequest,
  onProgress?: (step: string) => void,
  onBulkProgress?: (progress: BulkProgress) => void,
  onVariationComplete?: (result: GenerateResponse) => void,
): Promise<GenerateResponse[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const topic = req.topic.trim().slice(0, 500);
  if (!topic) throw new Error("Topic is required");
  if (![30, 60].includes(req.duration)) throw new Error("Invalid duration");
  if (!req.voice) throw new Error("Voice is required");
  if (!req.background) throw new Error("Background is required");

  const count = Math.max(1, Math.min(6, req.variations || 1));

  const rows = Array.from({ length: count }, () => ({
    user_id: user.id,
    topic,
    duration: req.duration,
    voice: req.voice,
    background: req.background,
    status: "pending" as const,
  }));

  const { data: jobs, error: insertError } = await supabase
    .from("jobs")
    .insert(rows)
    .select();

  if (insertError || !jobs || jobs.length === 0) {
    throw new Error(insertError?.message || "Failed to create jobs");
  }

  const jobIds = jobs.map((j) => j.id as string);
  if (onProgress) onProgress(STATUS_LABELS.pending);

  return new Promise<GenerateResponse[]>((resolve, reject) => {
    let settled = false;
    const results = new Map<string, GenerateResponse>();
    const statuses = new Map<string, JobStatus>();
    const channels: ReturnType<typeof supabase.channel>[] = [];

    function cleanup() {
      channels.forEach((ch) => supabase.removeChannel(ch));
    }

    function broadcastProgress() {
      if (settled) return;

      let furthestStatus: JobStatus = "pending";
      for (const s of statuses.values()) {
        const order: JobStatus[] = [
          "pending", "generating_script", "generating_voice",
          "fitting_audio", "building_subtitles", "assembling_video",
          "uploading", "completed",
        ];
        if (order.indexOf(s) > order.indexOf(furthestStatus)) {
          furthestStatus = s;
        }
      }

      if (onProgress) {
        onProgress(STATUS_LABELS[furthestStatus] || furthestStatus);
      }
      if (onBulkProgress) {
        onBulkProgress({
          completed: results.size,
          total: jobIds.length,
          step: STATUS_LABELS[furthestStatus] || furthestStatus,
        });
      }
    }

    for (const jobId of jobIds) {
      statuses.set(jobId, "pending");

      const channel = supabase
        .channel(`job-${jobId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "jobs",
            filter: `id=eq.${jobId}`,
          },
          (payload) => {
            if (settled) return;
            const updated = payload.new as Record<string, unknown>;
            const status = updated.status as JobStatus;
            statuses.set(jobId, status);

            if (status === "completed") {
              const result: GenerateResponse = {
                jobId,
                videoUrl: updated.video_url as string,
                script: updated.script as string,
              };
              results.set(jobId, result);
              onVariationComplete?.(result);

              if (results.size === jobIds.length) {
                settled = true;
                cleanup();
                resolve(jobIds.map((id) => results.get(id)!));
                return;
              }
            }

            if (status === "failed") {
              settled = true;
              cleanup();
              reject(new Error((updated.error as string) || "Video generation failed"));
              return;
            }

            broadcastProgress();
          }
        )
        .subscribe();

      channels.push(channel);
    }

    const timeoutMs = count * 10 * 60 * 1000;
    setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        reject(new Error("Generation timed out. Check your jobs page for status."));
      }
    }, timeoutMs);
  });
}

export interface JobRecord {
  id: string;
  status: string;
  topic: string;
  duration: number;
  voice: string;
  background: string;
  script: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  audio_url: string | null;
  subtitles_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export async function getUserJobs(): Promise<JobRecord[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as JobRecord[];
}

export async function getSignedVideoUrl(jobId: string): Promise<string | null> {
  try {
    const headers: Record<string, string> = {};
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      headers["Authorization"] = `Bearer ${session.access_token}`;
    }
    const base = BACKEND_URL || "";
    const res = await fetch(`${base}/api/signed-url/${encodeURIComponent(jobId)}/video.mp4`, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    return data.url || null;
  } catch {
    return null;
  }
}

export interface CategoryInfo {
  name: string;
  clips30: number;
  clips60: number;
}

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

export async function getCategories(): Promise<CategoryInfo[]> {
  if (!BACKEND_URL) return [];
  try {
    const res = await fetch(`${BACKEND_URL}/api/youtube/categories`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data.categories) ? data.categories : [];
  } catch {
    return [];
  }
}

export interface YouTubeDownloadRequest {
  url: string;
  category: string;
  duration: 30 | 60;
  clips: number;
}

// ---- Stripe ----

export async function createStripeCheckout(plan: "starter" | "growth" | "creator"): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const res = await fetch(`${BACKEND_URL}/api/stripe/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ plan }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Checkout failed" }));
    throw new Error(err.error || "Checkout failed");
  }

  const data = await res.json();
  return data.url;
}

export async function createStripePortal(): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const res = await fetch(`${BACKEND_URL}/api/stripe/portal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Portal failed" }));
    throw new Error(err.error || "Portal failed");
  }

  const data = await res.json();
  return data.url;
}

// ---- Profile ----

export interface UserProfile {
  id: string;
  tier: string;
  is_admin: boolean;
  daily_videos_used: number;
  daily_videos_reset_at: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
}

export async function getMyProfile(): Promise<UserProfile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) return null;
  return data as UserProfile;
}

export async function getPublicSettings(): Promise<Record<string, string>> {
  const { data, error } = await supabase.from("app_settings").select("*");
  if (error) return {};

  const settings: Record<string, string> = {};
  for (const row of data || []) {
    settings[row.key] = row.value;
  }
  return settings;
}

// ---- Admin settings ----

export async function getAdminSettings(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const res = await fetch(`${BACKEND_URL}/api/admin/settings`, {
    headers: { "Authorization": `Bearer ${session.access_token}` },
  });

  if (!res.ok) throw new Error("Failed to fetch settings");
  const data = await res.json();
  return data.settings || {};
}

export async function updateAdminSettings(settings: Record<string, string>): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const res = await fetch(`${BACKEND_URL}/api/admin/settings`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ settings }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Update failed" }));
    throw new Error(err.error || "Update failed");
  }
}

// ---- Source Videos ----

export interface SourceClip {
  id: string;
  clip_duration: number;
  filename: string;
  start_time: number | null;
  times_used: number;
  created_at: string;
}

export interface SourceVideo {
  id: string;
  youtube_url: string;
  youtube_id: string | null;
  title: string | null;
  category: string;
  source_path: string | null;
  duration_seconds: number | null;
  status: string;
  error: string | null;
  created_at: string;
  source_clips: SourceClip[];
}

export async function getSourceVideos(): Promise<SourceVideo[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("source_videos")
    .select("*, source_clips(id, clip_duration, filename, start_time, times_used, created_at)")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);
  return (data || []) as SourceVideo[];
}

export interface ReprocessRequest {
  duration: 30 | 60;
  clips: number;
}

export async function reprocessSourceVideo(
  sourceId: string,
  req: ReprocessRequest,
  onProgress?: (step: string) => void
): Promise<{ count: number; files: string[] }> {
  if (!BACKEND_URL) throw new Error("Backend URL not configured");

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const res = await fetch(`${BACKEND_URL}/api/youtube/reprocess/${sourceId}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ duration: req.duration, clips: req.clips }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Reprocess failed" }));
    throw new Error(err.error || "Reprocess failed");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let lastResult: { count: number; files: string[] } | null = null;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.step && onProgress) onProgress(parsed.step);
        if (parsed.count !== undefined) lastResult = parsed;
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
      }
    }
  }

  if (lastResult) return lastResult;
  throw new Error("No result received");
}

// ---- YouTube Download ----

export async function downloadYouTubeBackground(
  req: YouTubeDownloadRequest,
  onProgress?: (step: string) => void
): Promise<{ count: number; files: string[] }> {
  if (!BACKEND_URL) throw new Error("Backend URL not configured. YouTube management requires VITE_BACKEND_URL when running locally.");
  if (!req.url.trim()) throw new Error("YouTube URL is required");
  if (!/^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\//i.test(req.url)) {
    throw new Error("Invalid YouTube URL");
  }
  if (!req.category || !/^[a-z0-9-]+$/i.test(req.category)) {
    throw new Error("Invalid category name");
  }

  const { data: { session } } = await supabase.auth.getSession();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (session?.access_token) {
    headers["Authorization"] = `Bearer ${session.access_token}`;
  }

  const res = await fetch(`${BACKEND_URL}/api/youtube/download`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      url: req.url.trim(),
      category: req.category,
      duration: req.duration,
      clips: Math.max(1, Math.min(20, req.clips)),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Download failed" }));
    throw new Error(err.error || "Download failed");
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream");

  const decoder = new TextDecoder();
  let lastResult: { count: number; files: string[] } | null = null;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.step && onProgress) onProgress(parsed.step);
        if (parsed.count !== undefined) lastResult = parsed;
      } catch (e) {
        if (e instanceof SyntaxError) continue;
        if (e instanceof Error && e.message !== "Unexpected end of JSON input") throw e;
      }
    }
  }

  if (lastResult) return lastResult;
  throw new Error("No result received");
}
