import fs from "fs";
import path from "path";
import { WordTimestamp } from "./voice.js";

const GENERATED_DIR = path.resolve(process.cwd(), "generated");

const MAX_WORDS_PER_GROUP = 3;

// ── Subtitle Presets ──────────────────────────────────────────────────

export type WordEffectMode =
  | "keep_color_only"
  | "scale_pop"
  | "glow"
  | "box"
  | "combo";

export type SubtitleSize = "small" | "medium" | "large";

export interface SubtitleColorOverrides {
  text?: string | null;
  active?: string | null;
  outline?: string | null;
  box?: string | null;
}

export interface SubtitlePresetConfig {
  fontname: string;
  fontsize: number;
  primaryColour: string;   // ASS &HAABBGGRR format – text colour
  outlineColour: string;
  backColour: string;
  bold: number;            // -1 = true, 0 = false
  outline: number;
  shadow: number;
  highlightColour: string; // ASS &HBBGGRR (no alpha prefix) for active word
  activeScalePct: number;        // \fscx/\fscy for spoken word pop
  activeOutline: number;         // \bord for spoken word glow/border
  activeBlur: number;            // \blur for spoken word softness
  activeShadow: number;          // \shad for spoken word depth
  activeOutlineColour: string;   // ASS colour for spoken word outline/glow
  activeBackColour: string;      // ASS colour for spoken word back layer
  activeBackAlpha: string;       // ASS alpha &H00& opaque -> &HFF& transparent
}

export const SUBTITLE_PRESETS: Record<string, SubtitlePresetConfig> = {
  classic: {
    fontname: "Montserrat",
    fontsize: 80,
    primaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    backColour: "&HA0000000",
    bold: -1,
    outline: 5,
    shadow: 0,
    highlightColour: "&H00D7FF&",
    activeScalePct: 116,
    activeOutline: 8,
    activeBlur: 2.8,
    activeShadow: 0,
    activeOutlineColour: "&H000000&",
    activeBackColour: "&H222222&",
    activeBackAlpha: "&H6A&",
  },
  "bold-pop": {
    fontname: "Bangers",
    fontsize: 90,
    primaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    backColour: "&H80000000",
    bold: -1,
    outline: 6,
    shadow: 3,
    highlightColour: "&HFFFF00&",
    activeScalePct: 124,
    activeOutline: 10,
    activeBlur: 3.6,
    activeShadow: 1,
    activeOutlineColour: "&H000000&",
    activeBackColour: "&H111111&",
    activeBackAlpha: "&H5A&",
  },
  clean: {
    fontname: "Inter",
    fontsize: 72,
    primaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    backColour: "&H60000000",
    bold: 0,
    outline: 3,
    shadow: 0,
    highlightColour: "&H33FF77&",
    activeScalePct: 112,
    activeOutline: 5,
    activeBlur: 1.8,
    activeShadow: 0,
    activeOutlineColour: "&H0A0A0A&",
    activeBackColour: "&H111111&",
    activeBackAlpha: "&H72&",
  },
  neon: {
    fontname: "Montserrat",
    fontsize: 78,
    primaryColour: "&H00FFFFFF",
    outlineColour: "&H00FF44DD",
    backColour: "&H80000000",
    bold: -1,
    outline: 4,
    shadow: 4,
    highlightColour: "&H9966FF&",
    activeScalePct: 118,
    activeOutline: 9,
    activeBlur: 4.2,
    activeShadow: 1,
    activeOutlineColour: "&HFF44DD&",
    activeBackColour: "&H220022&",
    activeBackAlpha: "&H64&",
  },
  typewriter: {
    fontname: "Courier Prime",
    fontsize: 68,
    primaryColour: "&H00FFFFFF",
    outlineColour: "&H00222222",
    backColour: "&H80000000",
    bold: 0,
    outline: 3,
    shadow: 2,
    highlightColour: "&H0088FF&",
    activeScalePct: 108,
    activeOutline: 5,
    activeBlur: 1.5,
    activeShadow: 1,
    activeOutlineColour: "&H222222&",
    activeBackColour: "&H111111&",
    activeBackAlpha: "&H74&",
  },
  impact: {
    fontname: "Anton",
    fontsize: 85,
    primaryColour: "&H00FFFFFF",
    outlineColour: "&H00000000",
    backColour: "&HA0000000",
    bold: -1,
    outline: 5,
    shadow: 1,
    highlightColour: "&H4444FF&",
    activeScalePct: 120,
    activeOutline: 9,
    activeBlur: 2.9,
    activeShadow: 1,
    activeOutlineColour: "&H000000&",
    activeBackColour: "&H1A1A1A&",
    activeBackAlpha: "&H60&",
  },
};

export const VALID_SUBTITLE_PRESETS = new Set(Object.keys(SUBTITLE_PRESETS));
export const VALID_WORD_EFFECT_MODES = new Set<WordEffectMode>([
  "keep_color_only",
  "scale_pop",
  "glow",
  "box",
  "combo",
]);
export const VALID_SUBTITLE_SIZES = new Set<SubtitleSize>(["small", "medium", "large"]);

// ── Internals ─────────────────────────────────────────────────────────

interface WordGroup {
  words: WordTimestamp[];
  start: number;
  end: number;
  text: string;
}

function groupWords(timestamps: WordTimestamp[]): WordGroup[] {
  const groups: WordGroup[] = [];
  let current: WordTimestamp[] = [];

  for (const ts of timestamps) {
    current.push(ts);

    const gap = current.length >= 2
      ? ts.start - current[current.length - 2].end
      : 0;
    const reachedMax = current.length >= MAX_WORDS_PER_GROUP;
    const hasNaturalBreak = gap > 0.3;

    if (reachedMax || (current.length >= 2 && hasNaturalBreak)) {
      groups.push({
        words: [...current],
        start: current[0].start,
        end: current[current.length - 1].end,
        text: current.map((w) => w.word).join(" "),
      });
      current = [];
    }
  }

  if (current.length > 0) {
    groups.push({
      words: current,
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.word).join(" "),
    });
  }

  return groups;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const cs = Math.round((seconds % 1) * 100);
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function escapeAss(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
}

function normalizeAssColour(color: string): string {
  const cleaned = color.trim().toUpperCase();
  const argb = cleaned.match(/^&H([0-9A-F]{8})$/);
  if (argb) return `&H${argb[1].slice(2)}&`;
  const bgr = cleaned.match(/^&H([0-9A-F]{6})&?$/);
  if (bgr) return `&H${bgr[1]}&`;
  return cleaned.endsWith("&") ? cleaned : `${cleaned}&`;
}

function normalizeAssAlpha(alpha: string): string {
  const cleaned = alpha.trim().toUpperCase();
  const match = cleaned.match(/^&H([0-9A-F]{2})&?$/);
  if (match) return `&H${match[1]}&`;
  return "&H00&";
}

function hexToAssBgr(hex: string): string {
  const normalized = hex.trim().toUpperCase();
  const match = normalized.match(/^#([0-9A-F]{6})$/);
  if (!match) return "FFFFFF";
  const rgb = match[1];
  const rr = rgb.slice(0, 2);
  const gg = rgb.slice(2, 4);
  const bb = rgb.slice(4, 6);
  return `${bb}${gg}${rr}`;
}

function assStyleColourFromHex(hex: string, alpha: string = "00"): string {
  return `&H${alpha}${hexToAssBgr(hex)}`;
}

function assTagColourFromHex(hex: string): string {
  return `&H${hexToAssBgr(hex)}&`;
}

function styleAlphaFromColour(styleColour: string): string {
  const cleaned = styleColour.trim().toUpperCase();
  const argb = cleaned.match(/^&H([0-9A-F]{8})$/);
  if (argb) return `&H${argb[1].slice(0, 2)}&`;
  return "&H00&";
}

function scaleFontSize(base: number, size: SubtitleSize): number {
  const multipliers: Record<SubtitleSize, number> = {
    small: 0.88,
    medium: 1.0,
    large: 1.35,
  };
  return Math.max(1, Math.round(base * multipliers[size]));
}

function scaleStyleMetric(base: number, size: SubtitleSize): number {
  const multipliers: Record<SubtitleSize, number> = {
    small: 0.9,
    medium: 1.0,
    large: 1.2,
  };
  return Math.max(0, Math.round(base * multipliers[size]));
}

function buildActiveWordTag(cfg: SubtitlePresetConfig, mode: WordEffectMode): string {
  const includeScale = mode === "scale_pop" || mode === "combo";
  const includeGlow = mode === "glow" || mode === "combo";
  const includeBox = mode === "box" || mode === "combo";

  const tags = [
    `\\1c${normalizeAssColour(cfg.highlightColour)}`,
    "\\1a&H00&",
  ];

  if (includeGlow) {
    tags.push(`\\3c${normalizeAssColour(cfg.activeOutlineColour)}`);
    tags.push("\\3a&H00&");
    tags.push(`\\bord${cfg.activeOutline}`);
    tags.push(`\\blur${cfg.activeBlur}`);
    tags.push(`\\shad${cfg.activeShadow}`);
  }

  if (includeBox) {
    tags.push(`\\4c${normalizeAssColour(cfg.activeBackColour)}`);
    tags.push(`\\4a${normalizeAssAlpha(cfg.activeBackAlpha)}`);
  }

  if (includeScale) {
    tags.push(`\\fscx${cfg.activeScalePct}`);
    tags.push(`\\fscy${cfg.activeScalePct}`);
  }

  return tags.join("");
}

function buildResetWordTag(cfg: SubtitlePresetConfig): string {
  return [
    `\\1c${normalizeAssColour(cfg.primaryColour)}`,
    `\\3c${normalizeAssColour(cfg.outlineColour)}`,
    `\\4c${normalizeAssColour(cfg.backColour)}`,
    `\\4a${styleAlphaFromColour(cfg.backColour)}`,
    `\\bord${cfg.outline}`,
    "\\blur0",
    `\\shad${cfg.shadow}`,
    "\\fscx100",
    "\\fscy100",
  ].join("");
}

function buildDialogueEvents(groups: WordGroup[], cfg: SubtitlePresetConfig, wordEffectMode: WordEffectMode): string[] {
  const events: string[] = [];
  const activeWordTag = buildActiveWordTag(cfg, wordEffectMode);
  const resetWordTag = buildResetWordTag(cfg);

  for (const group of groups) {
    for (let activeIdx = 0; activeIdx < group.words.length; activeIdx++) {
      const word = group.words[activeIdx];
      const eventStart = word.start;
      const eventEnd =
        activeIdx < group.words.length - 1
          ? group.words[activeIdx + 1].start
          : word.end;

      let styledText = "";
      for (let j = 0; j < group.words.length; j++) {
        const w = escapeAss(group.words[j].word.toUpperCase());
        if (j === activeIdx) {
          styledText += `{${activeWordTag}}${w}{${resetWordTag}}`;
        } else {
          styledText += w;
        }
        if (j < group.words.length - 1) styledText += " ";
      }

      events.push(
        `Dialogue: 0,${formatTime(eventStart)},${formatTime(eventEnd)},Default,,0,0,0,,${styledText}`
      );
    }
  }

  return events;
}

// ── Public API ─────────────────────────────────────────────────────────

export async function generateSubtitles(
  timestamps: WordTimestamp[],
  jobId: string,
  preset: string = "classic",
  wordEffectMode: WordEffectMode = "combo",
  subtitleSize: SubtitleSize = "medium",
  colorOverrides: SubtitleColorOverrides = {},
): Promise<string> {
  const baseCfg = SUBTITLE_PRESETS[preset] || SUBTITLE_PRESETS.classic;
  const baseBackAlpha = styleAlphaFromColour(baseCfg.backColour).replace(/[^0-9A-F]/gi, "");
  const resolvedCfg: SubtitlePresetConfig = {
    ...baseCfg,
    primaryColour: colorOverrides.text ? assStyleColourFromHex(colorOverrides.text) : baseCfg.primaryColour,
    highlightColour: colorOverrides.active ? assTagColourFromHex(colorOverrides.active) : baseCfg.highlightColour,
    outlineColour: colorOverrides.outline
      ? assStyleColourFromHex(colorOverrides.outline)
      : baseCfg.outlineColour,
    activeOutlineColour: colorOverrides.outline
      ? assTagColourFromHex(colorOverrides.outline)
      : baseCfg.activeOutlineColour,
    backColour: colorOverrides.box
      ? assStyleColourFromHex(colorOverrides.box, baseBackAlpha || "00")
      : baseCfg.backColour,
    activeBackColour: colorOverrides.box
      ? assTagColourFromHex(colorOverrides.box)
      : baseCfg.activeBackColour,
  };

  const scaledFontSize = scaleFontSize(resolvedCfg.fontsize, subtitleSize);
  const scaledOutline = scaleStyleMetric(resolvedCfg.outline, subtitleSize);
  const scaledShadow = scaleStyleMetric(resolvedCfg.shadow, subtitleSize);

  if (timestamps.length > 0) {
    const last = timestamps[timestamps.length - 1];
    console.log(
      `Subtitles: ${timestamps.length} words, span ${timestamps[0].start.toFixed(2)}s — ${last.end.toFixed(2)}s (preset: ${preset}, effect: ${wordEffectMode}, size: ${subtitleSize})`
    );
  }

  const groups = groupWords(timestamps);
  const events = buildDialogueEvents(groups, resolvedCfg, wordEffectMode);

  const styleLine = [
    "Default",
    resolvedCfg.fontname,
    scaledFontSize,
    resolvedCfg.primaryColour,
    "&H000000FF",
    resolvedCfg.outlineColour,
    resolvedCfg.backColour,
    resolvedCfg.bold,
    0, 0, 0,      // Italic, Underline, StrikeOut
    100, 100,      // ScaleX, ScaleY
    2, 0,          // Spacing, Angle
    1,             // BorderStyle
    scaledOutline,
    scaledShadow,
    5,             // Alignment (top-center for short-form)
    60, 60, 350,   // MarginL, MarginR, MarginV
    1,             // Encoding
  ].join(",");

  const ass = `[Script Info]
Title: Invisible Creator Video Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: ${styleLine}

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;

  const assPath = path.join(GENERATED_DIR, `${jobId}.ass`);
  fs.writeFileSync(assPath, ass, "utf-8");
  return assPath;
}
