import { useEffect, useState, useCallback } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Session } from "@supabase/supabase-js";
import VideoGenerator from "../components/VideoGenerator";
import Navbar from "../components/Navbar";
import { getUserJobs, getSignedVideoUrl, JobRecord } from "../lib/api";
import { supabase } from "../lib/supabase";
import {
  Play,
  ExternalLink,
  Download,
  Loader2,
  Film,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Video,
} from "lucide-react";

interface Props {
  session: Session | null;
  isAdmin: boolean;
  onLogout: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  pending: { label: "Queued", color: "text-yellow-400 bg-yellow-400/10 border-yellow-400/20", icon: Clock },
  generating_script: { label: "Scripting", color: "text-blue-400 bg-blue-400/10 border-blue-400/20", icon: Loader2 },
  generating_voice: { label: "Voice", color: "text-blue-400 bg-blue-400/10 border-blue-400/20", icon: Loader2 },
  fitting_audio: { label: "Fitting", color: "text-blue-400 bg-blue-400/10 border-blue-400/20", icon: Loader2 },
  building_subtitles: { label: "Subtitles", color: "text-blue-400 bg-blue-400/10 border-blue-400/20", icon: Loader2 },
  assembling_video: { label: "Assembling", color: "text-blue-400 bg-blue-400/10 border-blue-400/20", icon: Loader2 },
  uploading: { label: "Uploading", color: "text-purple-400 bg-purple-400/10 border-purple-400/20", icon: Loader2 },
  completed: { label: "Done", color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20", icon: CheckCircle2 },
  failed: { label: "Failed", color: "text-red-400 bg-red-400/10 border-red-400/20", icon: XCircle },
};

function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = config.icon;
  const isAnimated = !["completed", "failed"].includes(status);

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium ${config.color}`}>
      <Icon className={`w-3 h-3 ${isAnimated ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}

export default function Dashboard({ session, isAdmin, onLogout }: Props) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [previewJobId, setPreviewJobId] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewScript, setPreviewScript] = useState<string | null>(null);

  useEffect(() => {
    if (!session) {
      navigate("/", { replace: true });
    }
  }, [session, navigate]);

  const fetchJobs = useCallback(async () => {
    try {
      const data = await getUserJobs();
      setJobs(data);
    } catch {
      // silently fail
    } finally {
      setLoadingJobs(false);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    fetchJobs();
  }, [session, fetchJobs]);

  useEffect(() => {
    if (!session) return;

    const channel = supabase
      .channel("dashboard-jobs")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jobs" },
        () => {
          fetchJobs();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, fetchJobs]);

  const handleSelectJob = useCallback(async (job: JobRecord) => {
    if (job.status !== "completed") return;
    setPreviewJobId(job.id);
    setPreviewScript(job.script);
    setPreviewLoading(true);
    setPreviewUrl(null);

    const url = await getSignedVideoUrl(job.id);
    setPreviewUrl(url || job.video_url);
    setPreviewLoading(false);
  }, []);

  const handleVideoGenerated = useCallback(async (jobId: string, videoUrl: string, script: string) => {
    setPreviewJobId(jobId);
    setPreviewUrl(videoUrl);
    setPreviewScript(script);
    fetchJobs();
  }, [fetchJobs]);

  useEffect(() => {
    if (jobs.length > 0 && !previewJobId) {
      const latest = jobs.find((j) => j.status === "completed");
      if (latest) handleSelectJob(latest);
    }
  }, [jobs, previewJobId, handleSelectJob]);

  if (!session) return null;

  return (
    <div className="min-h-screen bg-surface">
      <Navbar
        session={session}
        isAdmin={isAdmin}
        onLogin={() => {}}
        onLogout={onLogout}
      />

      <main className="pt-20 pb-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="font-display text-3xl font-bold text-white">
              Your <span className="text-primary">Studio</span>
            </h1>
            <p className="text-white/40 text-sm mt-1">Create and manage your videos</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Left column: Video Preview */}
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white/60 uppercase tracking-wider">
                <Film className="w-4 h-4" />
                Preview
              </h2>
              <div className="rounded-2xl bg-surface-card border border-white/5 overflow-hidden">
                {previewLoading ? (
                  <div className="flex flex-col items-center justify-center py-20">
                    <Loader2 className="w-8 h-8 text-primary animate-spin" />
                    <p className="text-white/30 text-sm mt-3">Loading video...</p>
                  </div>
                ) : previewUrl ? (
                  <div>
                    <div className="bg-black flex items-center justify-center">
                      <video
                        key={previewUrl}
                        src={previewUrl}
                        controls
                        className="w-full max-h-[60vh]"
                        style={{ aspectRatio: "9/16" }}
                      />
                    </div>
                    <div className="p-4 flex gap-3">
                      <a
                        href={previewUrl}
                        download
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent/15 hover:bg-accent/25 text-accent font-semibold rounded-xl transition-colors text-sm"
                      >
                        <Download className="w-4 h-4" />
                        Download
                      </a>
                      {previewJobId && (
                        <Link
                          to={`/preview/${previewJobId}`}
                          target="_blank"
                          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 font-semibold rounded-xl transition-colors text-sm"
                        >
                          <ExternalLink className="w-4 h-4" />
                          Share
                        </Link>
                      )}
                    </div>
                    {previewScript && (
                      <div className="px-4 pb-4">
                        <details className="rounded-xl border border-white/5 bg-surface">
                          <summary className="px-4 py-3 text-sm font-medium text-white/50 cursor-pointer hover:text-white/70">
                            View Script
                          </summary>
                          <p className="px-4 pb-4 text-sm text-white/35 leading-relaxed whitespace-pre-wrap">
                            {previewScript}
                          </p>
                        </details>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                    <Video className="w-12 h-12 text-white/10 mb-3" />
                    <p className="text-white/30 text-sm">No video selected</p>
                    <p className="text-white/15 text-xs mt-1">
                      Generate a video or select one from your history below
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Right column: Video Generator */}
            <div className="space-y-4">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white/60 uppercase tracking-wider">
                <Play className="w-4 h-4" />
                Create New Video
              </h2>
              <VideoGenerator
                session={session}
                onNeedAuth={() => {}}
                onVideoGenerated={handleVideoGenerated}
              />
            </div>
          </div>

          {/* Video History Table */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white/60 uppercase tracking-wider">
                <Clock className="w-4 h-4" />
                Your Videos
              </h2>
              <button
                onClick={() => { setLoadingJobs(true); fetchJobs(); }}
                className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Refresh
              </button>
            </div>

            <div className="rounded-2xl bg-surface-card border border-white/5 overflow-hidden">
              {loadingJobs ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              ) : jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                  <Film className="w-10 h-10 text-white/10 mb-3" />
                  <p className="text-white/30 text-sm">No videos yet</p>
                  <p className="text-white/15 text-xs mt-1">
                    Create your first video using the form above
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left px-5 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Topic</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider hidden sm:table-cell">Duration</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider hidden md:table-cell">Voice</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Status</th>
                        <th className="text-left px-5 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider hidden sm:table-cell">Date</th>
                        <th className="text-right px-5 py-3 text-xs font-semibold text-white/30 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/[0.03]">
                      {jobs.map((job) => {
                        const isSelected = previewJobId === job.id;
                        const isCompleted = job.status === "completed";

                        return (
                          <tr
                            key={job.id}
                            onClick={() => isCompleted && handleSelectJob(job)}
                            className={`transition-colors ${
                              isCompleted ? "cursor-pointer hover:bg-white/[0.03]" : ""
                            } ${isSelected ? "bg-primary/5" : ""}`}
                          >
                            <td className="px-5 py-3.5">
                              <span className={`font-medium truncate block max-w-[200px] ${isSelected ? "text-primary" : "text-white/80"}`}>
                                {job.topic}
                              </span>
                            </td>
                            <td className="px-5 py-3.5 text-white/40 hidden sm:table-cell">
                              {job.duration}s
                            </td>
                            <td className="px-5 py-3.5 text-white/40 hidden md:table-cell">
                              {job.voice}
                            </td>
                            <td className="px-5 py-3.5">
                              <StatusBadge status={job.status} />
                              {job.status === "failed" && job.error && (
                                <span className="ml-2 group relative">
                                  <AlertCircle className="w-3.5 h-3.5 text-red-400/60 inline-block" />
                                  <span className="absolute left-0 bottom-full mb-1 hidden group-hover:block bg-surface-card border border-white/10 rounded-lg px-3 py-2 text-xs text-red-400 whitespace-nowrap z-10 shadow-xl">
                                    {job.error}
                                  </span>
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-3.5 text-white/30 text-xs hidden sm:table-cell">
                              {new Date(job.created_at).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </td>
                            <td className="px-5 py-3.5 text-right">
                              {isCompleted && (
                                <Link
                                  to={`/preview/${job.id}`}
                                  target="_blank"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-xs text-primary/60 hover:text-primary transition-colors"
                                >
                                  <ExternalLink className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Preview</span>
                                </Link>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
