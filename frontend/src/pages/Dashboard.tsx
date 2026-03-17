import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Session } from "@supabase/supabase-js";
import VideoGenerator from "../components/VideoGenerator";
import Navbar from "../components/Navbar";
import { getUserJobs, getSignedVideoUrl, getMyProfile, JobRecord, UserProfile, getPublicSettings } from "../lib/api";
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
  ArrowUpRight,
  Info,
  X,
  Mic,
  MonitorPlay,
  FileText,
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

function VideoCard({
  job,
  onClick,
  onShowInfo,
}: {
  job: JobRecord;
  onClick: () => void;
  onShowInfo: () => void;
}) {
  const isCompleted = job.status === "completed";
  const [imgLoaded, setImgLoaded] = useState(false);

  const dateStr = new Date(job.created_at).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const timeStr = new Date(job.created_at).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="group">
      <div
        onClick={onClick}
        className="relative aspect-[9/16] rounded-xl overflow-hidden border border-white/10 hover:border-white/25 cursor-pointer transition-all bg-surface"
      >
        {isCompleted && job.thumbnail_url ? (
          <>
            <img
              src={job.thumbnail_url}
              alt={job.topic}
              className="w-full h-full object-cover"
              loading="lazy"
              onLoad={() => setImgLoaded(true)}
            />
            {!imgLoaded && (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white/20 animate-spin" />
              </div>
            )}
          </>
        ) : isCompleted ? (
          <div className="w-full h-full flex items-center justify-center">
            <Film className="w-8 h-8 text-white/10" />
          </div>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 px-3">
            <StatusBadge status={job.status} />
            <p className="text-[10px] text-white/30 text-center truncate w-full">{job.topic}</p>
            {job.status === "failed" && job.error && (
              <p className="text-[9px] text-red-400/60 text-center line-clamp-2">{job.error}</p>
            )}
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent pointer-events-none" />
        <div className="absolute bottom-2 left-2 right-2">
          <p className="text-[11px] text-white font-medium truncate">{job.topic}</p>
          <p className="text-[10px] text-white/50">{job.duration}s &middot; {job.voice}</p>
        </div>
        {isCompleted && (
          <div className="absolute top-0 left-0 right-0 flex items-center justify-end gap-1 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              onClick={(e) => { e.stopPropagation(); onShowInfo(); }}
              className="w-7 h-7 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/70 hover:text-primary hover:bg-black/80 transition-colors"
              title="Details"
            >
              <Info className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        {isCompleted && (
          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <div className="w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
              <Play className="w-5 h-5 text-white ml-0.5" />
            </div>
          </div>
        )}
      </div>
      <p className="mt-1.5 px-0.5 text-[11px] text-white/30">{dateStr} &middot; {timeStr}</p>
    </div>
  );
}

function VideoPlayerModal({
  job,
  videoUrl,
  loading,
  onClose,
  initialShowDetails = false,
}: {
  job: JobRecord;
  videoUrl: string | null;
  loading: boolean;
  onClose: () => void;
  initialShowDetails?: boolean;
}) {
  const [showDetails, setShowDetails] = useState(initialShowDetails);
  const [playing, setPlaying] = useState(false);
  const modalVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!playing || !videoUrl) return;
    const vid = modalVideoRef.current;
    if (!vid) return;
    vid.muted = true;
    const p = vid.play();
    if (p) p.then(() => { vid.muted = false; }).catch(() => {});
  }, [playing, videoUrl]);

  const handlePlay = () => {
    if (!videoUrl && !loading) return;
    setPlaying(true);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative flex flex-col items-center max-h-[95vh] w-full max-w-md">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute -top-2 -right-2 z-10 w-9 h-9 rounded-full bg-surface-card border border-white/10 flex items-center justify-center text-white/50 hover:text-white transition-colors shadow-xl"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Video / Thumbnail */}
        <div className="w-full rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">
          {playing && videoUrl ? (
            <video
              ref={modalVideoRef}
              key={videoUrl}
              src={videoUrl}
              controls
              playsInline
              className="w-full"
              style={{ aspectRatio: "9/16" }}
            />
          ) : loading ? (
            <div className="aspect-[9/16] flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : job.thumbnail_url ? (
            <div className="relative cursor-pointer" onClick={handlePlay}>
              <img
                src={job.thumbnail_url}
                alt={job.topic}
                className="w-full"
                style={{ aspectRatio: "9/16", objectFit: "cover" }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center hover:bg-black/70 transition-colors">
                  <Play className="w-8 h-8 text-white ml-1" />
                </div>
              </div>
            </div>
          ) : (
            <div className="aspect-[9/16] flex items-center justify-center cursor-pointer" onClick={handlePlay}>
              <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                <Play className="w-8 h-8 text-white ml-1" />
              </div>
            </div>
          )}
        </div>

        {/* Bottom bar */}
        <div className="w-full mt-3 flex items-center gap-2">
          {videoUrl && (
            <a
              href={videoUrl}
              download
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent/15 hover:bg-accent/25 text-accent font-semibold rounded-xl transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              Download
            </a>
          )}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors ${
              showDetails
                ? "bg-primary/20 text-primary border border-primary/30"
                : "bg-white/5 hover:bg-white/10 text-white/60"
            }`}
          >
            <Info className="w-4 h-4" />
            Details
          </button>
          <Link
            to={`/preview/${job.id}`}
            target="_blank"
            className="flex items-center justify-center gap-2 px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/60 font-semibold rounded-xl transition-colors text-sm"
          >
            <ExternalLink className="w-4 h-4" />
          </Link>
        </div>

        {/* Expandable details panel */}
        {showDetails && (
          <div className="w-full mt-3 rounded-2xl bg-surface-card border border-white/10 p-4 space-y-3 overflow-y-auto max-h-[40vh]">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface border border-white/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-wider mb-1">
                  <Clock className="w-3 h-3" /> Duration
                </div>
                <p className="text-sm font-semibold text-white">{job.duration}s</p>
              </div>
              <div className="rounded-xl bg-surface border border-white/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-wider mb-1">
                  <Mic className="w-3 h-3" /> Voice
                </div>
                <p className="text-sm font-semibold text-white">{job.voice}</p>
              </div>
              <div className="rounded-xl bg-surface border border-white/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-wider mb-1">
                  <MonitorPlay className="w-3 h-3" /> Background
                </div>
                <p className="text-sm font-semibold text-white">{job.background}</p>
              </div>
              <div className="rounded-xl bg-surface border border-white/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-wider mb-1">
                  <Clock className="w-3 h-3" /> Created
                </div>
                <p className="text-xs text-white">
                  {new Date(job.created_at).toLocaleDateString(undefined, {
                    month: "short", day: "numeric", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              </div>
            </div>
            {job.script && (
              <div className="rounded-xl bg-surface border border-white/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-white/30 uppercase tracking-wider mb-2">
                  <FileText className="w-3 h-3" /> Script
                </div>
                <p className="text-sm text-white/60 leading-relaxed whitespace-pre-wrap">{job.script}</p>
              </div>
            )}
            {job.status === "failed" && job.error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-3">
                <div className="flex items-center gap-1.5 text-[10px] text-red-400/60 uppercase tracking-wider mb-1">
                  <AlertCircle className="w-3 h-3" /> Error
                </div>
                <p className="text-sm text-red-400">{job.error}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard({ session, isAdmin, onLogout }: Props) {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [appSettings, setAppSettings] = useState<Record<string, string>>({});

  const [popupJob, setPopupJob] = useState<JobRecord | null>(null);
  const [popupUrl, setPopupUrl] = useState<string | null>(null);
  const [popupLoading, setPopupLoading] = useState(false);
  const [popupShowDetails, setPopupShowDetails] = useState(false);

  useEffect(() => {
    if (!session) {
      navigate("/", { replace: true });
      return;
    }
    getMyProfile().then(setProfile).catch(() => {});
    getPublicSettings().then(setAppSettings).catch(() => {});
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
    if (!session?.user?.id) return;
    const channel = supabase
      .channel("dashboard-jobs")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "jobs",
          filter: `user_id=eq.${session.user.id}`,
        },
        () => { fetchJobs(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session, fetchJobs]);

  const handleVideoGenerated = useCallback(async () => {
    fetchJobs();
  }, [fetchJobs]);

  async function openPopup(job: JobRecord, showDetails: boolean) {
    if (job.status !== "completed") return;
    setPopupJob(job);
    setPopupUrl(null);
    setPopupLoading(true);
    setPopupShowDetails(showDetails);

    const freshUrl = await getSignedVideoUrl(job.id);
    setPopupUrl(freshUrl || job.video_url);
    setPopupLoading(false);
  }

  function handleClosePopup() {
    setPopupJob(null);
    setPopupUrl(null);
    setPopupLoading(false);
    setPopupShowDetails(false);
  }

  if (!session) return null;

  return (
    <div className="min-h-screen bg-surface">
      <Navbar
        session={session}
        isAdmin={isAdmin}
        onOpenAuth={() => {}}
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

          {profile && profile.tier === "free" && (
            <div className="mb-6 flex items-center justify-between rounded-xl bg-primary/10 border border-primary/20 px-5 py-3">
              <span className="text-sm text-white/70">
                <strong className="text-white">{profile.daily_videos_used}</strong> of{" "}
                <strong className="text-white">{appSettings.free_tier_daily_limit || "15"}</strong> daily videos used
              </span>
              <Link
                to="/pricing"
                className="flex items-center gap-1 text-sm font-semibold text-primary hover:text-primary-light transition-colors"
              >
                Upgrade
                <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
          )}

          {/* Create New Video */}
          <div className="space-y-4 mb-10">
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

          {/* TikTok-style Video Grid */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-white/60 uppercase tracking-wider">
                <Video className="w-4 h-4" />
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

            {loadingJobs ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              </div>
            ) : jobs.length === 0 ? (
              <div className="rounded-2xl bg-surface-card border border-white/5 flex flex-col items-center justify-center py-16 text-center px-6">
                <Film className="w-10 h-10 text-white/10 mb-3" />
                <p className="text-white/30 text-sm">No videos yet</p>
                <p className="text-white/15 text-xs mt-1">
                  Create your first video using the form above
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                {jobs.map((job) => (
                  <VideoCard
                    key={job.id}
                    job={job}
                    onClick={() => openPopup(job, false)}
                    onShowInfo={() => openPopup(job, true)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {popupJob && (
        <VideoPlayerModal
          job={popupJob}
          videoUrl={popupUrl}
          loading={popupLoading}
          onClose={handleClosePopup}
          initialShowDetails={popupShowDetails}
        />
      )}
    </div>
  );
}
