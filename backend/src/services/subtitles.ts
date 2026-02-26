import fs from "fs";
import path from "path";
import { WordTimestamp } from "./voice.js";

const GENERATED_DIR = path.resolve(process.cwd(), "generated");

const MAX_WORDS_PER_GROUP = 3;

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

function buildDialogueEvents(groups: WordGroup[]): string[] {
  const events: string[] = [];

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
          styledText += `{\\c&H00D7FF&}${w}{\\c&HFFFFFF&}`;
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

export async function generateSubtitles(
  timestamps: WordTimestamp[],
  jobId: string
): Promise<string> {
  if (timestamps.length > 0) {
    const last = timestamps[timestamps.length - 1];
    console.log(`Subtitles: ${timestamps.length} words, span ${timestamps[0].start.toFixed(2)}s — ${last.end.toFixed(2)}s`);
  }

  const groups = groupWords(timestamps);
  const events = buildDialogueEvents(groups);

  const ass = `[Script Info]
Title: Faceless Video Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Montserrat,80,&H00FFFFFF,&H000000FF,&H00000000,&HA0000000,-1,0,0,0,100,100,2,0,1,5,0,5,60,60,350,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${events.join("\n")}
`;

  const assPath = path.join(GENERATED_DIR, `${jobId}.ass`);
  fs.writeFileSync(assPath, ass, "utf-8");
  return assPath;
}
