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

export async function getCategories(): Promise<CategoryInfo[]> {
  return [];
}

export interface YouTubeDownloadRequest {
  url: string;
  category: string;
  duration: 30 | 60;
  clips: number;
}

export async function downloadYouTubeBackground(
  _req: YouTubeDownloadRequest,
  _onProgress?: (step: string) => void
): Promise<{ count: number; files: string[] }> {
  throw new Error("YouTube management is only available from the local admin server");
}
