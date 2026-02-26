import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Session } from "@supabase/supabase-js";
import { checkIsAdmin } from "../lib/admin";
import {
  downloadYouTubeBackground,
  getCategories,
  CategoryInfo,
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
} from "lucide-react";

interface Props {
  session: Session | null;
}

export default function Admin({ session }: Props) {
  const navigate = useNavigate();
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);

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

  useEffect(() => {
    if (authorized) fetchCategories();
  }, [authorized, fetchCategories]);

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    } finally {
      setLoading(false);
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
        </div>
      </main>
    </div>
  );
}
