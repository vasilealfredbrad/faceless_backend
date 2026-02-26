import { useState, useEffect } from "react";
import { Session } from "@supabase/supabase-js";
import { generateVideo, GenerateRequest, getCategories, CategoryInfo } from "../lib/api";
import {
  Wand2,
  Download,
  Clock,
  Mic,
  MonitorPlay,
  MessageSquare,
  FileText,
  AudioLines,
  Subtitles,
  Film,
  CheckCircle2,
  Circle,
  Loader2,
} from "lucide-react";

const VOICES = [
  { group: "American Female", voices: ["Autumn", "Melody", "Hannah", "Emily", "Ivy", "Kaitlyn", "Luna", "Willow", "Lauren", "Sierra"] },
  { group: "American Male", voices: ["Noah", "Jasper", "Caleb", "Ronan", "Ethan", "Daniel", "Zane"] },
  { group: "Chinese Female", voices: ["Mei", "Lian", "Ting", "Jing"] },
  { group: "Chinese Male", voices: ["Wei", "Jian", "Hao", "Sheng"] },
  { group: "Spanish", voices: ["Lucía", "Mateo", "Javier"] },
  { group: "French Female", voices: ["Élodie"] },
  { group: "Hindi", voices: ["Ananya", "Priya", "Arjun", "Rohan"] },
  { group: "Italian", voices: ["Giulia", "Luca"] },
  { group: "Portuguese", voices: ["Camila", "Thiago", "Rafael"] },
];

const PIPELINE_STEPS = [
  { key: "script", label: "Generating Script", icon: FileText, match: "script" },
  { key: "voice", label: "Creating Voiceover", icon: AudioLines, match: "voiceover" },
  { key: "fit", label: "Fitting Audio to Duration", icon: AudioLines, match: "fitting" },
  { key: "subs", label: "Building Subtitles", icon: Subtitles, match: "subtitle" },
  { key: "video", label: "Assembling Video", icon: Film, match: "assembl" },
  { key: "upload", label: "Uploading to Cloud", icon: Download, match: "upload" },
];

function getActiveStep(progress: string): number {
  if (!progress) return -1;
  const lower = progress.toLowerCase();
  for (let i = PIPELINE_STEPS.length - 1; i >= 0; i--) {
    if (lower.includes(PIPELINE_STEPS[i].match)) return i;
  }
  return 0;
}

interface Props {
  session: Session | null;
  onNeedAuth: () => void;
  onVideoGenerated?: (jobId: string, videoUrl: string, script: string) => void;
}

export default function VideoGenerator({ session, onNeedAuth, onVideoGenerated }: Props) {
  const [topic, setTopic] = useState("");
  const [duration, setDuration] = useState<30 | 60>(30);
  const [voice, setVoice] = useState("Noah");
  const [background, setBackground] = useState("minecraft");
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [stepTimers, setStepTimers] = useState<Record<number, number>>({});
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [showPipeline, setShowPipeline] = useState(false);
  const [pipelineComplete, setPipelineComplete] = useState(false);

  useEffect(() => {
    getCategories()
      .then(setCategories)
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setStepTimers((prev) => ({ ...prev }));
    }, 100);
    return () => clearInterval(interval);
  }, [loading]);

  const activeStep = getActiveStep(progress);

  async function handleGenerate() {
    if (!session) {
      onNeedAuth();
      return;
    }
    if (!topic.trim()) {
      setError("Please enter a topic");
      return;
    }

    setLoading(true);
    setError("");
    setProgress("Starting...");
    setStepTimers({});
    setShowPipeline(true);
    setPipelineComplete(false);
    setEndTime(0);
    const now = Date.now();
    setStartTime(now);

    try {
      const req: GenerateRequest = { topic, duration, voice, background };
      const result = await generateVideo(req, (step) => {
        setProgress(step);
        const stepIdx = getActiveStep(step);
        if (stepIdx >= 0) {
          setStepTimers((prev) => {
            const updated = { ...prev };
            if (!(stepIdx in updated)) {
              updated[stepIdx] = Date.now();
            }
            return updated;
          });
        }
      });
      setEndTime(Date.now());
      setPipelineComplete(true);
      onVideoGenerated?.(result.jobId, result.videoUrl, result.script);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setShowPipeline(false);
    } finally {
      setLoading(false);
    }
  }

  function formatElapsed(ms: number): string {
    const s = Math.floor(ms / 1000);
    return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-surface-card border border-white/5 p-6 space-y-5">
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
            <MessageSquare className="w-4 h-4" />
            Topic
          </label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. What's the best decision you've ever made?"
            className="w-full px-4 py-3 rounded-xl bg-surface border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50 transition-colors text-sm"
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
              <Clock className="w-4 h-4" />
              Duration
            </label>
            <div className="flex rounded-xl overflow-hidden border border-white/10">
              {([30, 60] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDuration(d)}
                  disabled={loading}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                    duration === d
                      ? "bg-primary text-white"
                      : "bg-surface text-white/40 hover:text-white/60"
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
              <MonitorPlay className="w-4 h-4" />
              Background
            </label>
            <select
              value={background}
              onChange={(e) => setBackground(e.target.value)}
              disabled={loading}
              className="w-full px-4 py-2.5 rounded-xl bg-surface border border-white/10 text-white text-sm focus:outline-none focus:border-primary/50"
            >
              {categories.length === 0 && (
                <option value="minecraft">minecraft</option>
              )}
              {categories.map((cat) => (
                <option key={cat.name} value={cat.name}>
                  {cat.name} ({duration === 30 ? cat.clips30 : cat.clips60} clips)
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
            <Mic className="w-4 h-4" />
            Voice
          </label>
          <select
            value={voice}
            onChange={(e) => setVoice(e.target.value)}
            disabled={loading}
            className="w-full px-4 py-3 rounded-xl bg-surface border border-white/10 text-white text-sm focus:outline-none focus:border-primary/50"
          >
            {VOICES.map((group) => (
              <optgroup key={group.group} label={group.group}>
                {group.voices.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-4 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors text-sm"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Wand2 className="w-5 h-5" />
              CREATE VIDEO
            </>
          )}
        </button>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>

      {showPipeline && (
        <div className="rounded-2xl bg-surface-card border border-white/5 p-5 space-y-1">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-white/40">
              {pipelineComplete ? "Complete!" : "Pipeline Progress"}
            </span>
            <span className="text-xs font-mono text-white/30">
              {formatElapsed((endTime || Date.now()) - startTime)}
            </span>
          </div>

          <div className="relative">
            <div className="absolute left-[15px] top-[20px] bottom-[20px] w-[2px] bg-white/5" />

            {PIPELINE_STEPS.map((step, i) => {
              const isDone = pipelineComplete || activeStep > i;
              const isActive = !pipelineComplete && activeStep === i;
              const isPending = !pipelineComplete && activeStep < i;
              const stepStart = stepTimers[i];
              const nextStart = stepTimers[i + 1];
              const elapsed = stepStart
                ? ((isDone && nextStart) ? nextStart : (pipelineComplete && !nextStart ? (endTime || Date.now()) : Date.now())) - stepStart
                : 0;

              return (
                <div key={step.key} className="relative flex items-center gap-4 py-2.5">
                  <div className="relative z-10 flex-shrink-0">
                    {isDone ? (
                      <CheckCircle2 className="w-[30px] h-[30px] text-accent" />
                    ) : isActive ? (
                      <div className="w-[30px] h-[30px] rounded-full border-2 border-primary bg-primary/20 flex items-center justify-center">
                        <Loader2 className="w-4 h-4 text-primary animate-spin" />
                      </div>
                    ) : (
                      <Circle className="w-[30px] h-[30px] text-white/10" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <step.icon
                        className={`w-4 h-4 flex-shrink-0 ${
                          isDone ? "text-accent" : isActive ? "text-primary" : "text-white/20"
                        }`}
                      />
                      <span
                        className={`text-sm font-medium ${
                          isDone ? "text-accent" : isActive ? "text-white" : "text-white/25"
                        }`}
                      >
                        {step.label}
                      </span>
                    </div>
                    {(isActive || isDone) && elapsed > 0 && (
                      <span className="text-[11px] text-white/25 ml-6 font-mono">
                        {formatElapsed(elapsed)}
                      </span>
                    )}
                  </div>

                  {isPending && (
                    <span className="text-[11px] text-white/15 font-medium">waiting</span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="mt-3 h-1.5 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500 ease-out"
              style={{ width: `${pipelineComplete ? 100 : Math.max(5, ((activeStep + 1) / PIPELINE_STEPS.length) * 100)}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
