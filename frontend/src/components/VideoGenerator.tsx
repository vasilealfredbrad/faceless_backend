import { useState, useEffect, useRef } from "react";
import { Session } from "@supabase/supabase-js";
import { generateVideo, GenerateRequest, getCategories, CategoryInfo, BulkProgress, WordEffectMode, SubtitleSize } from "../lib/api";
import { containsProfanity } from "../lib/profanity";
import VOICE_DEMO_FILES from "../lib/voice-demos";
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
  Layers,
  Play,
  Square,
  Type,
} from "lucide-react";

const VOICES = [
  { group: "American Female", voices: ["Autumn", "Melody", "Hannah", "Emily", "Ivy", "Kaitlyn", "Luna", "Willow", "Lauren", "Sierra"] },
  { group: "American Male", voices: ["Noah", "Jasper", "Caleb", "Ronan", "Ethan", "Daniel", "Zane"] },
];

const SUBTITLE_PRESETS = [
  { key: "classic", label: "Classic", desc: "Montserrat · Bold · Yellow highlight" },
  { key: "bold-pop", label: "Bold Pop", desc: "Bangers · Big · Cyan highlight" },
  { key: "clean", label: "Clean", desc: "Inter · Minimal · Lime highlight" },
  { key: "neon", label: "Neon", desc: "Montserrat · Glow · Pink highlight" },
  { key: "typewriter", label: "Typewriter", desc: "Courier · Vintage · Orange highlight" },
  { key: "impact", label: "Impact", desc: "Anton · Heavy · Red highlight" },
];

const WORD_EFFECT_MODES: { key: WordEffectMode; label: string; desc: string }[] = [
  { key: "keep_color_only", label: "Color Only", desc: "Highlight color only" },
  { key: "scale_pop", label: "Pop", desc: "Highlight + scale pop" },
  { key: "glow", label: "Glow", desc: "Highlight + glow" },
  { key: "box", label: "Box", desc: "Highlight + box" },
  { key: "combo", label: "Combo", desc: "Pop + glow + box" },
];

const WORD_EFFECT_PREVIEW_TEXT = {
  left: "THIS",
  active: "WORD",
  right: "NOW",
} as const;

const SUBTITLE_SIZES: { key: SubtitleSize; label: string; desc: string }[] = [
  { key: "small", label: "Small", desc: "Compact text" },
  { key: "medium", label: "Medium", desc: "Balanced size" },
  { key: "large", label: "Large", desc: "Bigger text" },
];

interface SubtitleColorState {
  text: string;
  active: string;
  outline: string;
  box: string;
}

const PRESET_COLOR_DEFAULTS: Record<string, SubtitleColorState> = {
  classic: { text: "#FFFFFF", active: "#FFD700", outline: "#000000", box: "#222222" },
  "bold-pop": { text: "#FFFFFF", active: "#00FFFF", outline: "#000000", box: "#111111" },
  clean: { text: "#FFFFFF", active: "#77FF33", outline: "#000000", box: "#111111" },
  neon: { text: "#FFFFFF", active: "#FF6699", outline: "#DD44FF", box: "#220022" },
  typewriter: { text: "#FFFFFF", active: "#FF8800", outline: "#222222", box: "#111111" },
  impact: { text: "#FFFFFF", active: "#FF4444", outline: "#000000", box: "#1A1A1A" },
};

const PRESET_PREVIEW_STYLE: Record<string, { fontFamily: string; fontSize: string; fontWeight: number; letterSpacing?: string }> = {
  classic: { fontFamily: "Montserrat, sans-serif", fontSize: "17px", fontWeight: 800, letterSpacing: "0.02em" },
  "bold-pop": { fontFamily: "Bangers, Impact, sans-serif", fontSize: "20px", fontWeight: 700, letterSpacing: "0.03em" },
  clean: { fontFamily: "Inter, sans-serif", fontSize: "16px", fontWeight: 600 },
  neon: { fontFamily: "Montserrat, sans-serif", fontSize: "17px", fontWeight: 800, letterSpacing: "0.02em" },
  typewriter: { fontFamily: "\"Courier Prime\", \"Courier New\", monospace", fontSize: "16px", fontWeight: 700 },
  impact: { fontFamily: "Anton, Impact, sans-serif", fontSize: "19px", fontWeight: 700, letterSpacing: "0.03em" },
};

const PIPELINE_STEPS = [
  { key: "script", label: "Generating Script", icon: FileText, match: "script" },
  { key: "voice", label: "Creating Voiceover", icon: AudioLines, match: "voiceover" },
  { key: "fit", label: "Fitting Audio to Duration", icon: AudioLines, match: "fitting" },
  { key: "subs", label: "Building Subtitles", icon: Subtitles, match: "subtitle" },
  { key: "video", label: "Assembling Video", icon: Film, match: "assembl" },
  { key: "upload", label: "Uploading to Cloud", icon: Download, match: "upload" },
];

const LUCKY_HOOKS = [
  "I thought this was a scam until",
  "Nobody believed me when I said",
  "This one decision changed everything:",
  "I tried this for 7 days and",
  "The moment I realized I was doing it all wrong:",
  "I almost quit before I discovered",
  "I ignored this tiny detail and",
  "The fastest way to ruin your progress is",
];

const LUCKY_SUBJECTS = [
  "building a faceless channel from zero",
  "growing views without posting every day",
  "writing hooks that stop the scroll",
  "turning one idea into multiple videos",
  "using AI scripts without sounding robotic",
  "getting consistent results with short videos",
  "choosing topics people actually watch",
  "scaling output without burnout",
];

const LUCKY_TWISTS = [
  "the first 3 videos failed, then one tweak made everything click.",
  "the secret was not better editing, it was better topic framing.",
  "I copied what everyone does, then did the opposite and won.",
  "the biggest growth came from a simple storytelling structure.",
  "my best video came from a topic I almost deleted.",
  "the hook looked wrong, but retention doubled.",
  "I stopped chasing trends and focused on human psychology.",
  "one small change in the first 2 seconds changed the outcome.",
];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function buildLuckyTopic(): string {
  const hook = pickRandom(LUCKY_HOOKS);
  const subject = pickRandom(LUCKY_SUBJECTS);
  const twist = pickRandom(LUCKY_TWISTS);
  return `${hook} ${subject} - ${twist}`;
}

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
  const [variations, setVariations] = useState(1);
  const [subtitlePreset, setSubtitlePreset] = useState("classic");
  const [wordEffectMode, setWordEffectMode] = useState<WordEffectMode>("combo");
  const [subtitleSize, setSubtitleSize] = useState<SubtitleSize>("medium");
  const [subtitleColors, setSubtitleColors] = useState<SubtitleColorState>(PRESET_COLOR_DEFAULTS.classic);
  const [previewPreset, setPreviewPreset] = useState<string | null>(null);
  const [previewWordEffect, setPreviewWordEffect] = useState<WordEffectMode | null>(null);
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [stepTimers, setStepTimers] = useState<Record<number, number>>({});
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [showPipeline, setShowPipeline] = useState(false);
  const [pipelineComplete, setPipelineComplete] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  const [playingVoice, setPlayingVoice] = useState<string | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const audioCacheRef = useRef<Map<string, HTMLAudioElement>>(new Map());

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

  useEffect(() => {
    setSubtitleColors(PRESET_COLOR_DEFAULTS[subtitlePreset] || PRESET_COLOR_DEFAULTS.classic);
  }, [subtitlePreset]);

  useEffect(() => {
    for (const [, url] of Object.entries(VOICE_DEMO_FILES)) {
      if (!audioCacheRef.current.has(url)) {
        const audio = new Audio(url);
        audio.preload = "auto";
        audioCacheRef.current.set(url, audio);
      }
    }
    return () => {
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
      for (const a of audioCacheRef.current.values()) a.pause();
      audioCacheRef.current.clear();
    };
  }, []);

  const activeStep = getActiveStep(progress);

  function handlePlayVoiceDemo(targetVoice?: string) {
    const demoVoice = targetVoice || voice;
    if (playingVoice === demoVoice && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      setPlayingVoice(null);
      return;
    }

    const demoUrl = VOICE_DEMO_FILES[demoVoice];
    if (!demoUrl) return;

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
    }
    let audio = audioCacheRef.current.get(demoUrl);
    if (!audio) {
      audio = new Audio(demoUrl);
      audio.preload = "auto";
      audioCacheRef.current.set(demoUrl, audio);
    }
    previewAudioRef.current = audio;
    audio.onended = () => setPlayingVoice(null);
    audio.onerror = () => setPlayingVoice(null);
    audio.currentTime = 0;
    audio.play().then(() => setPlayingVoice(demoVoice)).catch(() => {});
  }

  async function handleGenerate() {
    if (!session) {
      onNeedAuth();
      return;
    }
    if (!topic.trim()) {
      setError("Please enter a topic");
      return;
    }
    if (containsProfanity(topic)) {
      setError("Please use appropriate language");
      return;
    }

    setLoading(true);
    setError("");
    setProgress("Starting...");
    setStepTimers({});
    setShowPipeline(true);
    setPipelineComplete(false);
    setBulkProgress(null);
    setEndTime(0);
    const now = Date.now();
    setStartTime(now);

    try {
      const req: GenerateRequest = {
        topic,
        duration,
        voice,
        background,
        subtitlePreset,
        wordEffectMode,
        subtitleSize,
        subtitleColors,
        variations,
      };
      const results = await generateVideo(
        req,
        (step) => {
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
        },
        (bp) => setBulkProgress(bp),
        (result) => onVideoGenerated?.(result.jobId, result.videoUrl, result.script),
      );
      setEndTime(Date.now());
      setPipelineComplete(true);
      if (results.length === 1) {
        onVideoGenerated?.(results[0].jobId, results[0].videoUrl, results[0].script);
      }
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
      <style>{`
        @keyframes subtitlePopDemo {
          0% { transform: scale(1); }
          35% { transform: scale(1.22); }
          65% { transform: scale(1.08); }
          100% { transform: scale(1); }
        }
      `}</style>
      <div className="rounded-2xl bg-surface-card border border-white/5 p-6 space-y-5">
        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="flex items-center gap-2 text-sm font-medium text-white/70">
              <MessageSquare className="w-4 h-4" />
              Topic
            </label>
            <button
              type="button"
              onClick={() => { setTopic(buildLuckyTopic()); setError(""); }}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-surface hover:bg-white/5 text-white/70 text-xs font-semibold disabled:opacity-50"
            >
              <Wand2 className="w-3.5 h-3.5" />
              I&apos;m Feeling Lucky
            </button>
          </div>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. What's the best decision you've ever made?"
            className="w-full px-4 py-3 rounded-xl bg-surface border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50 transition-colors text-sm"
            disabled={loading}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
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
                  disabled={loading || d === 60}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                    duration === d
                      ? "bg-primary text-white"
                      : d === 60
                        ? "bg-surface text-white/20 cursor-not-allowed"
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

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
              <Layers className="w-4 h-4" />
              Variations
            </label>
            <div className="flex rounded-xl overflow-hidden border border-white/10">
              {[1, 2, 4, 6].map((v) => (
                <button
                  key={v}
                  onClick={() => setVariations(v)}
                  disabled={loading}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${
                    variations === v
                      ? "bg-primary text-white"
                      : "bg-surface text-white/40 hover:text-white/60"
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
            <Type className="w-4 h-4" />
            Subtitle Style
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            {SUBTITLE_PRESETS.map((p) => (
              <div
                key={p.key}
                className="relative"
                onMouseEnter={() => setPreviewPreset(p.key)}
                onMouseLeave={() => setPreviewPreset((curr) => (curr === p.key ? null : curr))}
              >
                <button
                  onClick={() => setSubtitlePreset(p.key)}
                  onFocus={() => setPreviewPreset(p.key)}
                  onBlur={() => setPreviewPreset((curr) => (curr === p.key ? null : curr))}
                  disabled={loading}
                  className={`w-full flex flex-col items-center rounded-xl border px-3 py-3 transition-colors text-center ${
                    subtitlePreset === p.key
                      ? "border-primary/50 bg-primary/15"
                      : "border-white/10 bg-surface hover:bg-white/5"
                  } disabled:opacity-50`}
                >
                  <span className={`text-sm font-bold ${subtitlePreset === p.key ? "text-primary" : "text-white/80"}`}>
                    {p.label}
                  </span>
                  <span className="text-[10px] text-white/35 mt-0.5 leading-tight">{p.desc}</span>
                </button>

                {previewPreset === p.key && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 w-56 rounded-xl border border-white/15 bg-[#0f1016] p-3 shadow-2xl">
                    <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Preview</p>
                    <div
                      className="rounded-lg border border-white/10 px-3 py-2 text-center"
                      style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
                    >
                      <span
                        style={{
                          ...PRESET_PREVIEW_STYLE[p.key],
                          color: PRESET_COLOR_DEFAULTS[p.key].text,
                          textShadow: `0 0 2px ${PRESET_COLOR_DEFAULTS[p.key].outline}, 0 0 6px ${PRESET_COLOR_DEFAULTS[p.key].outline}`,
                        }}
                      >
                        THIS{" "}
                        <span
                          style={{
                            color: PRESET_COLOR_DEFAULTS[p.key].active,
                            backgroundColor: PRESET_COLOR_DEFAULTS[p.key].box,
                            borderRadius: "5px",
                            padding: "0 6px",
                            boxShadow: `0 0 8px ${PRESET_COLOR_DEFAULTS[p.key].outline}`,
                          }}
                        >
                          STYLE
                        </span>{" "}
                        LOOKS GOOD
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
            <Subtitles className="w-4 h-4" />
            Spoken Word Effect
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {WORD_EFFECT_MODES.map((mode) => (
              <div
                key={mode.key}
                className="relative"
                onMouseEnter={() => setPreviewWordEffect(mode.key)}
                onMouseLeave={() => setPreviewWordEffect((curr) => (curr === mode.key ? null : curr))}
              >
                <button
                  onClick={() => setWordEffectMode(mode.key)}
                  onFocus={() => setPreviewWordEffect(mode.key)}
                  onBlur={() => setPreviewWordEffect((curr) => (curr === mode.key ? null : curr))}
                  disabled={loading}
                  className={`w-full flex flex-col items-center rounded-xl border px-3 py-3 transition-colors text-center ${
                    wordEffectMode === mode.key
                      ? "border-primary/50 bg-primary/15"
                      : "border-white/10 bg-surface hover:bg-white/5"
                  } disabled:opacity-50`}
                >
                  <span className={`text-sm font-bold ${wordEffectMode === mode.key ? "text-primary" : "text-white/80"}`}>
                    {mode.label}
                  </span>
                  <span className="text-[10px] text-white/35 mt-0.5 leading-tight">{mode.desc}</span>
                </button>

                {previewWordEffect === mode.key && (
                  <div className="absolute left-1/2 -translate-x-1/2 top-full mt-2 z-30 w-52 rounded-xl border border-white/15 bg-[#0f1016] p-3 shadow-2xl">
                    <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Preview</p>
                    <div className="rounded-lg border border-white/10 px-3 py-2 text-center bg-black/45">
                      <span className="text-sm font-extrabold text-white/85">{WORD_EFFECT_PREVIEW_TEXT.left} </span>
                      <span
                        className="text-sm font-extrabold"
                        style={{
                          color: subtitleColors.active,
                          transform:
                            mode.key === "scale_pop" || mode.key === "combo" ? "scale(1.14)" : "scale(1)",
                          display: "inline-block",
                          animation:
                            mode.key === "scale_pop" || mode.key === "combo"
                              ? "subtitlePopDemo 900ms ease-in-out infinite"
                              : "none",
                          textShadow:
                            mode.key === "glow" || mode.key === "combo"
                              ? `0 0 2px ${subtitleColors.outline}, 0 0 8px ${subtitleColors.outline}`
                              : "none",
                          backgroundColor:
                            mode.key === "box" || mode.key === "combo"
                              ? subtitleColors.box
                              : "transparent",
                          borderRadius:
                            mode.key === "box" || mode.key === "combo" ? "5px" : "0",
                          padding:
                            mode.key === "box" || mode.key === "combo" ? "0 6px" : "0",
                        }}
                      >
                        {WORD_EFFECT_PREVIEW_TEXT.active}
                      </span>
                      <span className="text-sm font-extrabold text-white/85"> {WORD_EFFECT_PREVIEW_TEXT.right}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
            <Type className="w-4 h-4" />
            Subtitle Size
          </label>
          <div className="grid grid-cols-3 gap-2">
            {SUBTITLE_SIZES.map((size) => (
              <button
                key={size.key}
                onClick={() => setSubtitleSize(size.key)}
                disabled={loading}
                className={`flex flex-col items-center rounded-xl border px-3 py-3 transition-colors text-center ${
                  subtitleSize === size.key
                    ? "border-primary/50 bg-primary/15"
                    : "border-white/10 bg-surface hover:bg-white/5"
                } disabled:opacity-50`}
              >
                <span className={`text-sm font-bold ${subtitleSize === size.key ? "text-primary" : "text-white/80"}`}>
                  {size.label}
                </span>
                <span className="text-[10px] text-white/35 mt-0.5 leading-tight">{size.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
            <Type className="w-4 h-4" />
            Subtitle Colors
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { key: "text" as const, label: "Text Color" },
              { key: "active" as const, label: "Active Word" },
              { key: "outline" as const, label: "Outline/Glow" },
              { key: "box" as const, label: "Box Color" },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-surface px-3 py-2"
              >
                <input
                  type="color"
                  value={subtitleColors[item.key]}
                  onChange={(e) => setSubtitleColors((prev) => ({ ...prev, [item.key]: e.target.value }))}
                  disabled={loading}
                  className="h-8 w-8 rounded border border-white/10 bg-transparent"
                />
                <span className="text-xs text-white/75 font-medium">{item.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-3 rounded-xl border border-white/10 bg-[#0f1016] p-3">
            <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2">Live color preview</p>
            <div className="rounded-lg border border-white/10 px-3 py-2 text-center bg-black/45">
              <span
                className="text-sm font-extrabold"
                style={{
                  color: subtitleColors.text,
                  textShadow: `0 0 2px ${subtitleColors.outline}, 0 0 6px ${subtitleColors.outline}`,
                }}
              >
                THIS{" "}
              </span>
              <span
                className="text-sm font-extrabold inline-block"
                style={{
                  color: subtitleColors.active,
                  textShadow:
                    wordEffectMode === "glow" || wordEffectMode === "combo"
                      ? `0 0 2px ${subtitleColors.outline}, 0 0 8px ${subtitleColors.outline}`
                      : "none",
                  backgroundColor:
                    wordEffectMode === "box" || wordEffectMode === "combo"
                      ? subtitleColors.box
                      : "transparent",
                  borderRadius:
                    wordEffectMode === "box" || wordEffectMode === "combo" ? "5px" : "0",
                  padding:
                    wordEffectMode === "box" || wordEffectMode === "combo" ? "0 6px" : "0",
                  animation:
                    wordEffectMode === "scale_pop" || wordEffectMode === "combo"
                      ? "subtitlePopDemo 900ms ease-in-out infinite"
                      : "none",
                }}
              >
                COLOR
              </span>
              <span
                className="text-sm font-extrabold"
                style={{
                  color: subtitleColors.text,
                  textShadow: `0 0 2px ${subtitleColors.outline}, 0 0 6px ${subtitleColors.outline}`,
                }}
              >
                {" "}DEMO
              </span>
            </div>
          </div>
        </div>

        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-2">
            <Mic className="w-4 h-4" />
            Voice
          </label>
          <div className="space-y-3">
            {VOICES.map((group) => (
              <div key={group.group}>
                <p className="text-[11px] text-white/30 mb-1.5">{group.group}</p>
                <div className="flex flex-wrap gap-2">
                  {group.voices.map((v) => {
                    const isSelected = voice === v;
                    const isPlaying = playingVoice === v;
                    return (
                      <div
                        key={v}
                        className={`flex items-center rounded-lg border ${
                          isSelected
                            ? "border-primary/50 bg-primary/15"
                            : "border-white/10 bg-surface"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setVoice(v)}
                          disabled={loading}
                          className={`px-3 py-2 text-xs font-semibold ${
                            isSelected ? "text-primary" : "text-white/70 hover:text-white"
                          } disabled:opacity-50`}
                        >
                          {v}
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePlayVoiceDemo(v)}
                          disabled={loading}
                          className="px-2 py-2 border-l border-white/10 text-white/50 hover:text-white disabled:opacity-50"
                          title={isPlaying ? "Stop demo" : "Play demo"}
                        >
                          {isPlaying ? <Square className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => handlePlayVoiceDemo(voice)}
              disabled={loading}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-surface hover:bg-white/5 text-white/70 text-xs font-semibold disabled:opacity-50"
            >
              {playingVoice === voice ? (
                <>
                  <Square className="w-3.5 h-3.5" />
                  Stop demo
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5" />
                  Play demo
                </>
              )}
            </button>
            <span className="text-[11px] text-white/35">Preview: {voice}</span>
          </div>
        </div>

        {showPipeline && !pipelineComplete && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-1">
            {PIPELINE_STEPS.map((step, i) => {
              const isDone = activeStep > i;
              const isActive = activeStep === i;
              const stepStart = stepTimers[i];
              const nextStart = stepTimers[i + 1];
              const elapsed = stepStart
                ? ((isDone && nextStart) ? nextStart : Date.now()) - stepStart
                : 0;

              return (
                <span
                  key={step.key}
                  className={`inline-flex items-center gap-1.5 text-sm font-medium ${
                    isDone ? "text-accent" : isActive ? "text-white" : "text-white/20"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-accent" />
                  ) : isActive ? (
                    <Loader2 className="w-4 h-4 text-primary animate-spin" />
                  ) : (
                    <Circle className="w-4 h-4 text-white/10" />
                  )}
                  {step.label}
                  {(isDone || isActive) && elapsed > 0 && (
                    <span className="text-xs text-white/30 font-mono">{formatElapsed(elapsed)}</span>
                  )}
                </span>
              );
            })}
            <span className="ml-auto text-xs font-mono text-white/30">
              {formatElapsed((endTime || Date.now()) - startTime)}
            </span>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 py-4 bg-primary hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors text-sm"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              {variations > 1 && bulkProgress
                ? `Generating ${bulkProgress.completed}/${bulkProgress.total}...`
                : "Generating..."}
            </>
          ) : (
            <>
              <Wand2 className="w-5 h-5" />
              {variations > 1 ? `CREATE ${variations} VIDEOS` : "CREATE VIDEO"}
            </>
          )}
        </button>

        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
