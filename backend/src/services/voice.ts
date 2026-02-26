import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";

const GENERATED_DIR = path.resolve(process.cwd(), "generated");

const rawKey = process.env.UNREALSPEECH_API_KEY || "";
if (!rawKey) {
  console.warn("WARNING: UNREALSPEECH_API_KEY not set. Voice generation will fail.");
}
const UNREALSPEECH_API_KEY = rawKey.startsWith("Bearer ") ? rawKey : `Bearer ${rawKey}`;

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface VoiceResult {
  audioPath: string;
  timestamps: WordTimestamp[];
  audioDuration: number;
}

export async function generateVoice(
  text: string,
  voiceId: string,
  jobId: string
): Promise<VoiceResult> {
  if (!text.trim()) throw new Error("Cannot generate voice from empty text");

  fs.mkdirSync(GENERATED_DIR, { recursive: true });

  const response = await fetch("https://api.v8.unrealspeech.com/speech", {
    method: "POST",
    headers: {
      Authorization: UNREALSPEECH_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      Text: text.slice(0, 3000),
      VoiceId: voiceId,
      Bitrate: "192k",
      Speed: 0,
      Pitch: 1.0,
      TimestampType: "word",
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => "Unknown error");
    throw new Error(`Unreal Speech API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const { OutputUri, TimestampsUri } = data;

  if (!OutputUri || !TimestampsUri) {
    throw new Error("Missing OutputUri or TimestampsUri from Unreal Speech response");
  }

  const audioResponse = await fetch(OutputUri);
  if (!audioResponse.ok) throw new Error(`Failed to download audio: HTTP ${audioResponse.status}`);
  const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());
  const audioPath = path.join(GENERATED_DIR, `${jobId}.mp3`);
  fs.writeFileSync(audioPath, audioBuffer);

  const tsResponse = await fetch(TimestampsUri);
  if (!tsResponse.ok) throw new Error(`Failed to download timestamps: HTTP ${tsResponse.status}`);
  const rawTimestamps = await tsResponse.json();
  const timestamps = normalizeTimestamps(rawTimestamps);

  const audioDuration = getAudioDuration(audioPath);
  console.log(`Voice: ${timestamps.length} words, duration: ${audioDuration.toFixed(2)}s`);

  return { audioPath, timestamps, audioDuration };
}

function getAudioDuration(filePath: string): number {
  try {
    const result = execFileSync(
      "ffprobe",
      ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", filePath],
      { encoding: "utf-8", timeout: 10_000 }
    ).trim();
    const dur = parseFloat(result);
    if (isNaN(dur) || dur <= 0) throw new Error("Invalid duration");
    return dur;
  } catch {
    throw new Error("Failed to probe audio duration with ffprobe");
  }
}

export function timeStretchAudio(
  inputPath: string,
  targetDuration: number,
  actualDuration: number,
  jobId: string
): { stretchedPath: string; tempoFactor: number } {
  if (actualDuration <= 0) throw new Error("Invalid audio duration for time-stretching");

  const tempoFactor = actualDuration / targetDuration;

  if (tempoFactor > 0.95 && tempoFactor < 1.05) {
    console.log(`Audio ${actualDuration.toFixed(1)}s ≈ ${targetDuration}s, skipping stretch`);
    return { stretchedPath: inputPath, tempoFactor: 1 };
  }

  if (tempoFactor < 0.25 || tempoFactor > 4.0) {
    throw new Error(`Audio duration mismatch too extreme: ${actualDuration.toFixed(1)}s vs target ${targetDuration}s`);
  }

  const stretchedPath = path.join(GENERATED_DIR, `${jobId}_stretched.mp3`);

  const filters: string[] = [];
  let remaining = tempoFactor;
  while (remaining > 2.0) {
    filters.push("atempo=2.0");
    remaining /= 2.0;
  }
  while (remaining < 0.5) {
    filters.push("atempo=0.5");
    remaining *= 2.0;
  }
  filters.push(`atempo=${remaining.toFixed(4)}`);

  const filterChain = filters.join(",");
  console.log(`Stretch: ${actualDuration.toFixed(1)}s → ${targetDuration}s (factor: ${tempoFactor.toFixed(3)})`);

  execFileSync(
    "ffmpeg",
    ["-y", "-i", inputPath, "-af", filterChain, stretchedPath],
    { stdio: "pipe", timeout: 60_000 }
  );

  if (!fs.existsSync(stretchedPath)) {
    throw new Error("FFmpeg time-stretch produced no output");
  }

  return { stretchedPath, tempoFactor };
}

export function scaleTimestamps(
  timestamps: WordTimestamp[],
  tempoFactor: number
): WordTimestamp[] {
  if (tempoFactor === 1) return timestamps;
  const scale = 1 / tempoFactor;
  return timestamps.map((ts) => ({
    word: ts.word,
    start: ts.start * scale,
    end: ts.end * scale,
  }));
}

function normalizeTimestamps(raw: unknown): WordTimestamp[] {
  if (Array.isArray(raw)) {
    return raw.map((item: Record<string, unknown>) => ({
      word: String(item.word || item.Word || ""),
      start: Number(item.start ?? item.Start ?? 0),
      end: Number(item.end ?? item.End ?? 0),
    }));
  }

  if (raw && typeof raw === "object" && "words" in (raw as Record<string, unknown>)) {
    return normalizeTimestamps((raw as Record<string, unknown>).words);
  }

  throw new Error("Unexpected timestamp format from Unreal Speech");
}
