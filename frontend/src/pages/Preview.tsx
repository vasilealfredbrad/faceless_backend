import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Play, ArrowLeft, Download, Loader2, LogIn } from "lucide-react";

interface Job {
  id: string;
  status: string;
  topic: string;
  duration: number;
  voice: string;
  script: string | null;
  video_url: string | null;
  error: string | null;
  created_at: string;
}

async function getSignedVideoUrl(jobId: string): Promise<string | null> {
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

export default function Preview() {
  const { jobId } = useParams<{ jobId: string }>();
  const [job, setJob] = useState<Job | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!jobId) return;

    let cancelled = false;

    async function fetchJob() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        if (!cancelled) setError("sign_in_required");
        if (!cancelled) setLoading(false);
        return;
      }

      const { data, error: fetchErr } = await supabase
        .from("jobs")
        .select("*")
        .eq("id", jobId)
        .eq("user_id", user.id)
        .single();

      if (fetchErr || !data) {
        if (!cancelled) setError("Video not found");
        if (!cancelled) setLoading(false);
        return;
      }

      if (!cancelled) setJob(data as Job);
      if (!cancelled) setLoading(false);

      if (data.status === "completed" && data.video_url) {
        const signed = await getSignedVideoUrl(jobId!);
        if (!cancelled) setVideoSrc(signed || data.video_url);
      }

      if (data.status !== "completed" && data.status !== "failed") {
        const channel = supabase
          .channel(`preview-${jobId}`)
          .on(
            "postgres_changes",
            {
              event: "UPDATE",
              schema: "public",
              table: "jobs",
              filter: `id=eq.${jobId}`,
            },
            async (payload) => {
              const updated = payload.new as Job;
              if (!cancelled) setJob(updated);
              if (updated.status === "completed" && updated.video_url) {
                const signed = await getSignedVideoUrl(jobId!);
                if (!cancelled) setVideoSrc(signed || updated.video_url);
              }
            }
          )
          .subscribe();

        return () => {
          cancelled = true;
          supabase.removeChannel(channel);
        };
      }
    }

    fetchJob();

    return () => { cancelled = true; };
  }, [jobId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (error === "sign_in_required") {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4">
        <LogIn className="w-10 h-10 text-white/20" />
        <p className="text-white/60 text-lg">Sign in to view this video</p>
        <Link
          to="/"
          className="flex items-center gap-2 text-primary hover:text-primary-dark transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Go to Home
        </Link>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-surface flex flex-col items-center justify-center gap-4">
        <p className="text-red-400 text-lg">{error || "Video not found"}</p>
        <Link
          to="/"
          className="flex items-center gap-2 text-primary hover:text-primary-dark transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    );
  }

  const isProcessing = job.status !== "completed" && job.status !== "failed";

  return (
    <div className="min-h-screen bg-surface">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            to="/dashboard"
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Studio
          </Link>
          <span className="font-display text-lg font-bold text-white">
            Invisible Creator<span className="text-primary">.video</span>
          </span>
        </div>
      </nav>

      <main className="pt-24 pb-16 px-4">
        <div className="max-w-lg mx-auto space-y-6">
          {isProcessing && (
            <div className="rounded-2xl bg-surface-card border border-white/5 p-8 text-center space-y-4">
              <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto" />
              <p className="text-white font-medium">Video is being generated...</p>
              <p className="text-white/40 text-sm capitalize">
                {job.status.replace(/_/g, " ")}
              </p>
            </div>
          )}

          {job.status === "failed" && (
            <div className="rounded-2xl bg-red-500/10 border border-red-500/20 p-8 text-center">
              <p className="text-red-400 font-medium">Generation Failed</p>
              <p className="text-red-400/60 text-sm mt-2">{job.error}</p>
            </div>
          )}

          {job.status === "completed" && videoSrc && (
            <>
              <div className="rounded-2xl overflow-hidden border border-white/10 bg-black w-fit mx-auto">
                <video
                  src={videoSrc}
                  controls
                  autoPlay
                  className="w-auto max-h-[70vh] mx-auto"
                  style={{ aspectRatio: "9/16" }}
                />
              </div>

              <div className="flex gap-3">
                <a
                  href={videoSrc}
                  download={`invisiblecreator-${job.id}.mp4`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-accent/15 hover:bg-accent/25 text-accent font-semibold rounded-xl transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  Download
                </a>
              </div>
            </>
          )}

          {job.status === "completed" && !videoSrc && (
            <div className="rounded-2xl bg-surface-card border border-white/5 p-8 text-center space-y-4">
              <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto" />
              <p className="text-white/40 text-sm">Loading video...</p>
            </div>
          )}

          <div className="rounded-2xl bg-surface-card border border-white/5 p-6 space-y-3">
            <h2 className="text-white font-semibold flex items-center gap-2">
              <Play className="w-4 h-4 text-primary" />
              {job.topic}
            </h2>
            <div className="flex gap-4 text-xs text-white/30">
              <span>{job.duration}s</span>
              <span>{job.voice}</span>
              <span>{new Date(job.created_at).toLocaleDateString()}</span>
            </div>
            {job.script && (
              <details className="pt-2">
                <summary className="text-sm text-white/40 cursor-pointer hover:text-white/60">
                  View Script
                </summary>
                <p className="mt-2 text-sm text-white/30 leading-relaxed whitespace-pre-wrap">
                  {job.script}
                </p>
              </details>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
