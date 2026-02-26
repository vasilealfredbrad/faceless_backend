import { supabase } from "./supabase";

export interface GenerateRequest {
  topic: string;
  duration: 30 | 60;
  voice: string;
  background: string;
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

export async function generateVideo(
  req: GenerateRequest,
  onProgress?: (step: string) => void
): Promise<GenerateResponse> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Not authenticated");

  const topic = req.topic.trim().slice(0, 500);
  if (!topic) throw new Error("Topic is required");
  if (![30, 60].includes(req.duration)) throw new Error("Invalid duration");
  if (!req.voice) throw new Error("Voice is required");
  if (!req.background) throw new Error("Background is required");

  const { data: job, error: insertError } = await supabase
    .from("jobs")
    .insert({
      user_id: user.id,
      topic,
      duration: req.duration,
      voice: req.voice,
      background: req.background,
      status: "pending",
    })
    .select()
    .single();

  if (insertError || !job) {
    throw new Error(insertError?.message || "Failed to create job");
  }

  const jobId = job.id as string;
  if (onProgress) onProgress(STATUS_LABELS.pending);

  return new Promise<GenerateResponse>((resolve, reject) => {
    let settled = false;

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

          if (onProgress) {
            onProgress(STATUS_LABELS[status] || status);
          }

          if (status === "completed") {
            settled = true;
            supabase.removeChannel(channel);
            resolve({
              jobId,
              videoUrl: updated.video_url as string,
              script: updated.script as string,
            });
          }

          if (status === "failed") {
            settled = true;
            supabase.removeChannel(channel);
            reject(new Error((updated.error as string) || "Video generation failed"));
          }
        }
      )
      .subscribe();

    setTimeout(() => {
      if (!settled) {
        settled = true;
        supabase.removeChannel(channel);
        reject(new Error("Generation timed out. Check your jobs page for status."));
      }
    }, 10 * 60 * 1000);
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
  audio_url: string | null;
  subtitles_url: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

export async function getUserJobs(): Promise<JobRecord[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
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
    const res = await fetch(`/api/signed-url?jobId=${encodeURIComponent(jobId)}&file=video.mp4`, { headers });
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

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.error) throw new Error(parsed.error);
        if (parsed.step && onProgress) onProgress(parsed.step);
        if (parsed.count !== undefined) lastResult = parsed;
      } catch (e) {
        if (e instanceof Error && e.message !== "Unexpected end of JSON input")
          throw e;
      }
    }
  }

  if (lastResult) return lastResult;
  throw new Error("No result received");
}
