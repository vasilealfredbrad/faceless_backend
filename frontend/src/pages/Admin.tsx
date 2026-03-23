import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Session } from "@supabase/supabase-js";
import { checkIsAdmin } from "../lib/admin";
import {
  downloadYouTubeBackground,
  getCategories,
  getAdminSettings,
  updateAdminSettings,
  getSourceVideos,
  reprocessSourceVideo,
  CategoryInfo,
  SourceVideo,
} from "../lib/api";
import {
  ArrowLeft,
  Youtube,
  Download,
  Loader2,
  FolderOpen,
  Clock,
  Scissors,
  Plus,
  Film,
  ShieldCheck,
  Settings,
  Save,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Database,
  RotateCcw,
  ExternalLink,
  Play,
} from "lucide-react";

interface Props {
  session: Session | null;
}

const STATUS_COLORS: Record<string, string> = {
  ready: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  downloading: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  cutting: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  failed: "text-red-400 bg-red-400/10 border-red-400/20",
};

export default function Admin({ session }: Props) {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [activeTab, setActiveTab] = useState<"youtube" | "demo" | "settings">("youtube");

  // YouTube state
  const [url, setUrl] = useState("");
  const [category, setCategory] = useState("minecraft");
  const [newCategory, setNewCategory] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [duration, setDuration] = useState<30 | 60>(30);
  const [clips, setClips] = useState(5);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [categories, setCategories] = useState<CategoryInfo[]>([]);

  // Source library state
  const [sources, setSources] = useState<SourceVideo[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);
  const [sourcesError, setSourcesError] = useState<string | null>(null);
  const [expandedSource, setExpandedSource] = useState<string | null>(null);
  const [reprocessId, setReprocessId] = useState<string | null>(null);
  const [reprocessDuration, setReprocessDuration] = useState<30 | 60>(30);
  const [reprocessClips, setReprocessClips] = useState(5);
  const [reprocessLoading, setReprocessLoading] = useState(false);
  const [reprocessProgress, setReprocessProgress] = useState("");
  const [reprocessError, setReprocessError] = useState("");
  const [reprocessSuccess, setReprocessSuccess] = useState("");

  // Demo videos state
  const [demoJobs, setDemoJobs] = useState<{ id: string; topic: string; voice: string; thumbnail_url: string | null; is_demo: boolean }[]>([]);
  const [demoJobsLoading, setDemoJobsLoading] = useState(false);
  const [demoTogglingId, setDemoTogglingId] = useState<string | null>(null);

  // Settings state
  const [freeTierEnabled, setFreeTierEnabled] = useState(true);
  const [freeTierDailyLimit, setFreeTierDailyLimit] = useState(5);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsError, setSettingsError] = useState("");

  useEffect(() => {
    if (!session) {
      navigate("/");
      return;
    }
    checkIsAdmin().then((isAdmin) => {
      if (!isAdmin) {
        navigate("/");
        return;
      }
      setAuthorized(true);
      setChecking(false);
    });
  }, [session, navigate]);

  const fetchCategories = useCallback(async () => {
    try {
      const cats = await getCategories();
      setCategories(cats);
    } catch {
      // silent
    }
  }, []);

  const fetchSources = useCallback(async () => {
    setSourcesLoading(true);
    setSourcesError(null);
    try {
      const data = await getSourceVideos();
      setSources(data);
    } catch (err) {
      setSourcesError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setSourcesLoading(false);
    }
  }, []);

  const fetchDemoJobs = useCallback(async () => {
    setDemoJobsLoading(true);
    try {
      const { data } = await import("../lib/supabase").then(m =>
        m.supabase
          .from("jobs")
          .select("id,topic,voice,thumbnail_url,is_demo")
          .eq("status", "completed")
          .eq("is_guest", false)
          .order("created_at", { ascending: false })
          .limit(50)
      );
      setDemoJobs((data || []) as { id: string; topic: string; voice: string; thumbnail_url: string | null; is_demo: boolean }[]);
    } catch {
      // silent
    } finally {
      setDemoJobsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authorized) {
      fetchCategories();
      fetchSources();
      loadSettings();
    }
  }, [authorized, fetchCategories, fetchSources]);

  async function toggleDemo(jobId: string, newValue: boolean) {
    setDemoTogglingId(jobId);
    try {
      const { BACKEND_URL } = await import("../lib/api");
      const { supabase: sb } = await import("../lib/supabase");
      const { data: { session: s } } = await sb.auth.getSession();
      await fetch(`${BACKEND_URL}/api/admin/jobs/${jobId}/demo`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s?.access_token}` },
        body: JSON.stringify({ is_demo: newValue }),
      });
      setDemoJobs((prev) => prev.map((j) => j.id === jobId ? { ...j, is_demo: newValue } : j));
    } catch {
      // silent
    } finally {
      setDemoTogglingId(null);
    }
  }

  async function loadSettings() {
    try {
      const s = await getAdminSettings();
      setFreeTierEnabled(s.free_tier_enabled !== "false");
      setFreeTierDailyLimit(parseInt(s.free_tier_daily_limit || "15", 10));
    } catch {
      // silent
    }
  }

  async function handleSaveSettings() {
    setSettingsLoading(true);
    setSettingsError("");
    setSettingsSaved(false);
    try {
      await updateAdminSettings({
        free_tier_enabled: String(freeTierEnabled),
        free_tier_daily_limit: String(freeTierDailyLimit),
      });
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
    } catch (err) {
      setSettingsError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSettingsLoading(false);
    }
  }

  async function handleDownload() {
    if (!url.trim()) {
      setError("Please enter a YouTube URL");
      return;
    }

    const targetCategory = showNewCategory
      ? newCategory.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
      : category;

    if (!targetCategory) {
      setError("Please enter a valid category name (lowercase, hyphens only)");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    setProgress("Starting...");

    try {
      const result = await downloadYouTubeBackground(
        { url, category: targetCategory, duration, clips },
        (step) => setProgress(step)
      );
      setSuccess(
        `Downloaded and cut ${result.count} clip${result.count !== 1 ? "s" : ""} (${duration}s each) into "${targetCategory}"`
      );
      setProgress("");
      setUrl("");
      fetchCategories();
      fetchSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleReprocess(sourceId: string) {
    setReprocessLoading(true);
    setReprocessError("");
    setReprocessSuccess("");
    setReprocessProgress("Starting reprocess...");

    try {
      const result = await reprocessSourceVideo(
        sourceId,
        { duration: reprocessDuration, clips: reprocessClips },
        (step) => setReprocessProgress(step)
      );
      setReprocessSuccess(
        `Cut ${result.count} new clip${result.count !== 1 ? "s" : ""} (${reprocessDuration}s each)`
      );
      setReprocessProgress("");
      setReprocessId(null);
      fetchCategories();
      fetchSources();
    } catch (err) {
      setReprocessError(err instanceof Error ? err.message : "Reprocess failed");
    } finally {
      setReprocessLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="min-h-screen bg-surface">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link
            to="/"
            className="flex items-center gap-2 text-white/60 hover:text-white transition-colors text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Link>
          <span className="font-display text-lg font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            Admin Dashboard
          </span>
          <div className="w-16" />
        </div>
      </nav>

      <main className="pt-24 pb-16 px-4">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Tab switcher */}
          <div className="flex rounded-xl overflow-hidden border border-white/10">
            <button
              onClick={() => setActiveTab("youtube")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
                activeTab === "youtube" ? "bg-accent text-white" : "bg-surface text-white/40 hover:text-white/60"
              }`}
            >
              <Youtube className="w-4 h-4" />
              Backgrounds
            </button>
            <button
              onClick={() => { setActiveTab("demo"); fetchDemoJobs(); }}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
                activeTab === "demo" ? "bg-primary text-white" : "bg-surface text-white/40 hover:text-white/60"
              }`}
            >
              <Film className="w-4 h-4" />
              Demo Videos
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors ${
                activeTab === "settings" ? "bg-primary text-white" : "bg-surface text-white/40 hover:text-white/60"
              }`}
            >
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>

          {activeTab === "youtube" && (
            <>
              <div>
                <h2 className="font-display text-3xl font-bold mb-2">
                  Background <span className="text-accent">Videos</span>
                </h2>
                <p className="text-white/40 text-sm">
                  Download YouTube videos and auto-cut them into background clips for users
                </p>
              </div>

              {categories.length > 0 && (
                <div className="flex flex-wrap gap-3">
                  {categories.map((cat) => (
                    <div
                      key={cat.name}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-surface-card border border-white/5 text-sm"
                    >
                      <Film className="w-4 h-4 text-primary" />
                      <span className="font-medium capitalize">{cat.name}</span>
                      <span className="text-white/30">
                        {cat.clips30} x 30s / {cat.clips60} x 60s
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Download form */}
              <div className="rounded-2xl bg-surface-card border border-white/5 p-6 sm:p-8 space-y-5">
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
                    <Youtube className="w-4 h-4" />
                    YouTube URL
                  </label>
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-4 py-3 rounded-xl bg-surface border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-accent/50 transition-colors text-sm"
                    disabled={loading}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
                      <FolderOpen className="w-4 h-4" />
                      Category
                    </label>
                    {showNewCategory ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newCategory}
                          onChange={(e) => setNewCategory(e.target.value)}
                          placeholder="e.g. subway-surfers"
                          className="flex-1 px-4 py-2.5 rounded-xl bg-surface border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-accent/50 text-sm"
                          disabled={loading}
                        />
                        <button
                          onClick={() => setShowNewCategory(false)}
                          className="px-3 py-2.5 rounded-xl bg-surface border border-white/10 text-white/40 hover:text-white/60 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <select
                          value={category}
                          onChange={(e) => setCategory(e.target.value)}
                          disabled={loading}
                          className="flex-1 px-4 py-2.5 rounded-xl bg-surface border border-white/10 text-white text-sm focus:outline-none focus:border-accent/50"
                        >
                          {categories.length === 0 && (
                            <option value="minecraft">minecraft</option>
                          )}
                          {categories.map((cat) => (
                            <option key={cat.name} value={cat.name}>
                              {cat.name}
                            </option>
                          ))}
                        </select>
                        <button
                          onClick={() => setShowNewCategory(true)}
                          disabled={loading}
                          className="flex items-center gap-1 px-3 py-2.5 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 text-xs font-medium transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          New
                        </button>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
                      <Clock className="w-4 h-4" />
                      Clip Duration
                    </label>
                    <div className="flex rounded-xl overflow-hidden border border-white/10">
                      {([30, 60] as const).map((d) => (
                        <button
                          key={d}
                          onClick={() => setDuration(d)}
                          disabled={loading}
                          className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                            duration === d
                              ? "bg-accent text-white"
                              : "bg-surface text-white/40 hover:text-white/60"
                          }`}
                        >
                          {d}s
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
                    <Scissors className="w-4 h-4" />
                    Number of Clips
                  </label>
                  <input
                    type="number"
                    value={clips}
                    onChange={(e) =>
                      setClips(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))
                    }
                    min={1}
                    max={20}
                    className="w-full px-4 py-3 rounded-xl bg-surface border border-white/10 text-white focus:outline-none focus:border-accent/50 transition-colors text-sm"
                    disabled={loading}
                  />
                  <p className="text-xs text-white/25 mt-1">
                    Clips are cut from random positions (first & last 10s excluded)
                  </p>
                </div>

                <button
                  onClick={handleDownload}
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-3 py-4 bg-accent hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors text-sm"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      {progress}
                    </>
                  ) : (
                    <>
                      <Download className="w-5 h-5" />
                      DOWNLOAD & CUT CLIPS
                    </>
                  )}
                </button>

                {error && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="p-4 rounded-xl bg-accent/10 border border-accent/20 text-accent text-sm">
                    {success}
                  </div>
                )}
              </div>

              {/* Source Library */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-white/60 uppercase tracking-wider">
                    <Database className="w-4 h-4" />
                    Source Library
                  </h3>
                  <button
                    onClick={fetchSources}
                    disabled={sourcesLoading}
                    className="flex items-center gap-1.5 text-xs text-white/30 hover:text-white/60 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${sourcesLoading ? "animate-spin" : ""}`} />
                    Refresh
                  </button>
                </div>

                {sourcesError ? (
                  <div className="rounded-2xl bg-surface-card border border-red-500/20 bg-red-500/5 p-6 text-center">
                    <p className="text-red-400 text-sm font-medium">{sourcesError}</p>
                    <p className="text-white/40 text-xs mt-1">
                      Ensure migration 005 is applied and your user has is_admin = true in profiles.
                    </p>
                    <button onClick={fetchSources} className="mt-3 text-xs text-primary hover:underline">
                      Retry
                    </button>
                  </div>
                ) : sourcesLoading && sources.length === 0 ? (
                  <div className="rounded-2xl bg-surface-card border border-white/5 p-8 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 text-primary animate-spin" />
                  </div>
                ) : sources.length === 0 ? (
                  <div className="rounded-2xl bg-surface-card border border-white/5 p-8 text-center">
                    <Film className="w-10 h-10 text-white/10 mx-auto mb-3" />
                    <p className="text-white/30 text-sm">No source videos yet</p>
                    <p className="text-white/15 text-xs mt-1">
                      Download a YouTube video above to get started
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sources.map((src) => {
                      const isExpanded = expandedSource === src.id;
                      const isReprocessing = reprocessId === src.id;
                      const clipCount = src.source_clips?.length || 0;
                      const clips30 = src.source_clips?.filter((c) => c.clip_duration === 30).length || 0;
                      const clips60 = src.source_clips?.filter((c) => c.clip_duration === 60).length || 0;
                      const statusColor = STATUS_COLORS[src.status] || STATUS_COLORS.ready;

                      return (
                        <div
                          key={src.id}
                          className="rounded-2xl bg-surface-card border border-white/5 overflow-hidden"
                        >
                          {/* Header row */}
                          <button
                            onClick={() => setExpandedSource(isExpanded ? null : src.id)}
                            className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/[0.02] transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0" />
                            )}

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-medium text-white truncate">
                                  {src.title || src.youtube_id || "Untitled"}
                                </p>
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${statusColor}`}>
                                  {src.status}
                                </span>
                              </div>
                              <div className="flex items-center gap-3 mt-1 text-xs text-white/30">
                                <span className="capitalize">{src.category}</span>
                                <span>{clips30} x 30s / {clips60} x 60s</span>
                                {src.duration_seconds && (
                                  <span>{Math.round(src.duration_seconds)}s total</span>
                                )}
                                <span>
                                  {new Date(src.created_at).toLocaleDateString(undefined, {
                                    month: "short", day: "numeric", year: "numeric",
                                  })}
                                </span>
                              </div>
                            </div>

                            {src.youtube_url && (
                              <a
                                href={src.youtube_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="flex-shrink-0 p-1.5 text-white/20 hover:text-red-400 transition-colors"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                            )}
                          </button>

                          {/* Expanded section */}
                          {isExpanded && (
                            <div className="border-t border-white/5 p-4 space-y-4">
                              {src.error && (
                                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                                  {src.error}
                                </div>
                              )}

                              {/* Clips table */}
                              {clipCount > 0 && (
                                <div className="overflow-x-auto rounded-xl border border-white/5">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-white/5 text-white/30">
                                        <th className="text-left px-3 py-2 font-semibold">File</th>
                                        <th className="text-left px-3 py-2 font-semibold">Duration</th>
                                        <th className="text-left px-3 py-2 font-semibold">Start</th>
                                        <th className="text-left px-3 py-2 font-semibold">Used</th>
                                        <th className="text-left px-3 py-2 font-semibold">Created</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/[0.03]">
                                      {src.source_clips.map((clip) => (
                                        <tr key={clip.id}>
                                          <td className="px-3 py-2 text-white/60 font-mono">{clip.filename}</td>
                                          <td className="px-3 py-2 text-white/40">{clip.clip_duration}s</td>
                                          <td className="px-3 py-2 text-white/40">
                                            {clip.start_time !== null ? `${clip.start_time.toFixed(1)}s` : "-"}
                                          </td>
                                          <td className="px-3 py-2 text-white/40">{clip.times_used}x</td>
                                          <td className="px-3 py-2 text-white/30">
                                            {new Date(clip.created_at).toLocaleDateString(undefined, {
                                              month: "short", day: "numeric",
                                            })}
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}

                              {/* Reprocess controls */}
                              {src.status === "ready" && (
                                <>
                                  {isReprocessing ? (
                                    <div className="space-y-3 rounded-xl bg-surface border border-white/10 p-4">
                                      <h4 className="text-xs font-semibold text-white/50 uppercase tracking-wider">
                                        Cut New Clips
                                      </h4>
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <label className="text-xs text-white/40 mb-1 block">Duration</label>
                                          <div className="flex rounded-lg overflow-hidden border border-white/10">
                                            {([30, 60] as const).map((d) => (
                                              <button
                                                key={d}
                                                onClick={() => setReprocessDuration(d)}
                                                disabled={reprocessLoading}
                                                className={`flex-1 py-2 text-xs font-semibold ${
                                                  reprocessDuration === d
                                                    ? "bg-accent text-white"
                                                    : "bg-surface text-white/40"
                                                }`}
                                              >
                                                {d}s
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                        <div>
                                          <label className="text-xs text-white/40 mb-1 block">Clips</label>
                                          <input
                                            type="number"
                                            value={reprocessClips}
                                            onChange={(e) =>
                                              setReprocessClips(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))
                                            }
                                            min={1}
                                            max={20}
                                            className="w-full px-3 py-2 rounded-lg bg-surface border border-white/10 text-white text-xs"
                                            disabled={reprocessLoading}
                                          />
                                        </div>
                                      </div>

                                      <div className="flex gap-2">
                                        <button
                                          onClick={() => handleReprocess(src.id)}
                                          disabled={reprocessLoading}
                                          className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-accent hover:bg-accent/80 disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition-colors"
                                        >
                                          {reprocessLoading ? (
                                            <>
                                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                              {reprocessProgress}
                                            </>
                                          ) : (
                                            <>
                                              <Scissors className="w-3.5 h-3.5" />
                                              Cut Clips
                                            </>
                                          )}
                                        </button>
                                        {!reprocessLoading && (
                                          <button
                                            onClick={() => { setReprocessId(null); setReprocessError(""); setReprocessSuccess(""); }}
                                            className="px-3 py-2.5 rounded-lg bg-surface border border-white/10 text-white/40 text-xs"
                                          >
                                            Cancel
                                          </button>
                                        )}
                                      </div>

                                      {reprocessError && (
                                        <p className="text-xs text-red-400">{reprocessError}</p>
                                      )}
                                      {reprocessSuccess && (
                                        <p className="text-xs text-emerald-400">{reprocessSuccess}</p>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => { setReprocessId(src.id); setReprocessError(""); setReprocessSuccess(""); }}
                                      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-accent/10 border border-accent/20 text-accent hover:bg-accent/20 text-xs font-semibold transition-colors"
                                    >
                                      <RotateCcw className="w-3.5 h-3.5" />
                                      Reprocess — Cut More Clips
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === "demo" && (
            <>
              <div>
                <h2 className="font-display text-3xl font-bold mb-2">
                  Demo <span className="text-primary">Videos</span>
                </h2>
                <p className="text-white/40 text-sm">
                  Select completed videos to display as demos on the homepage guest section.
                </p>
              </div>

              {demoJobsLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 text-primary animate-spin" />
                </div>
              ) : demoJobs.length === 0 ? (
                <div className="rounded-2xl bg-surface-card border border-white/5 p-10 text-center">
                  <Film className="w-10 h-10 text-white/10 mx-auto mb-3" />
                  <p className="text-white/30 text-sm">No completed videos yet</p>
                  <p className="text-white/15 text-xs mt-1">Generate some videos from the dashboard first</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {demoJobs.map((job) => (
                    <div
                      key={job.id}
                      className={`relative rounded-2xl overflow-hidden border transition-colors ${job.is_demo ? "border-primary/50" : "border-white/5"} bg-surface-card`}
                    >
                      <div className="aspect-[9/16] bg-black relative">
                        {job.thumbnail_url ? (
                          <img src={job.thumbnail_url} alt={job.topic} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Film className="w-8 h-8 text-white/10" />
                          </div>
                        )}
                        {job.is_demo && (
                          <div className="absolute top-2 left-2 bg-primary text-white text-[10px] font-bold px-2 py-1 rounded-full">
                            DEMO
                          </div>
                        )}
                      </div>
                      <div className="p-3 space-y-2">
                        <p className="text-xs text-white/70 line-clamp-2 leading-snug">{job.topic}</p>
                        <p className="text-[10px] text-white/30">{job.voice}</p>
                        <button
                          onClick={() => toggleDemo(job.id, !job.is_demo)}
                          disabled={demoTogglingId === job.id}
                          className={`w-full flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-colors ${
                            job.is_demo
                              ? "bg-primary/15 text-primary hover:bg-primary/25"
                              : "bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70"
                          }`}
                        >
                          {demoTogglingId === job.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : job.is_demo ? (
                            <><CheckCircle2 className="w-3 h-3" /> Remove Demo</>
                          ) : (
                            <><Play className="w-3 h-3" /> Set as Demo</>
                          )}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {activeTab === "settings" && (
            <>
              <div>
                <h2 className="font-display text-3xl font-bold mb-2">
                  App <span className="text-primary">Settings</span>
                </h2>
                <p className="text-white/40 text-sm">
                  Configure free tier and other global settings
                </p>
              </div>

              <div className="rounded-2xl bg-surface-card border border-white/5 p-6 sm:p-8 space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-1">Enable Free Tier</h3>
                    <p className="text-xs text-white/40">
                      Allow registered users to generate videos for free (within daily limits)
                    </p>
                  </div>
                  <button
                    onClick={() => setFreeTierEnabled(!freeTierEnabled)}
                    className={`relative w-12 h-7 rounded-full transition-colors ${
                      freeTierEnabled ? "bg-primary" : "bg-white/10"
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-5 h-5 rounded-full bg-white transition-transform ${
                        freeTierEnabled ? "left-6" : "left-1"
                      }`}
                    />
                  </button>
                </div>

                <div>
                  <label className="text-sm font-semibold text-white mb-1 block">
                    Daily Video Limit (Free Tier)
                  </label>
                  <p className="text-xs text-white/40 mb-2">
                    Maximum videos a free-tier user can generate per day
                  </p>
                  <input
                    type="number"
                    value={freeTierDailyLimit}
                    onChange={(e) => setFreeTierDailyLimit(Math.max(1, parseInt(e.target.value) || 1))}
                    min={1}
                    max={100}
                    className="w-32 px-4 py-2.5 rounded-xl bg-surface border border-white/10 text-white text-sm focus:outline-none focus:border-primary/50"
                  />
                </div>

                <button
                  onClick={handleSaveSettings}
                  disabled={settingsLoading}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-bold rounded-xl transition-colors text-sm"
                >
                  {settingsLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : settingsSaved ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Settings
                    </>
                  )}
                </button>

                {settingsError && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {settingsError}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
