import { buildStoryPrompt } from "../templates/story-prompt.js";

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

if (!GROQ_API_KEY) {
  console.warn("WARNING: GROQ_API_KEY not set. Script generation will fail.");
}

const MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "openai/gpt-oss-20b",
];

function sanitizeTopic(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s.,!?'"()-]/g, "")
    .slice(0, 500)
    .trim();
}

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

async function callGroq(model: string, messages: Message[]): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${GROQ_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.8,
          max_tokens: 1024,
        }),
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      console.warn(`Model ${model}: HTTP ${response.status}`);
      return null;
    }

    const data = await response.json();
    const script = data.choices?.[0]?.message?.content?.trim();
    return script || null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort")) {
      console.warn(`Model ${model}: timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    } else {
      console.warn(`Model ${model}: ${msg}`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function cleanScript(raw: string): string {
  return raw
    .replace(/^["']|["']$/g, "")
    .replace(/^(Title|Script|Hook|Setup|CTA|Resolution|Climax|Core Message|Rising Tension):?\s*/gim, "")
    .replace(/^\*\*.*?\*\*:?\s*/gm, "")
    .replace(/^[-–—•]\s*/gm, "")
    .replace(/\[.*?\]/g, "")
    .replace(/#\w+/g, "")
    .replace(/\n{2,}/g, " ")
    .replace(/\n/g, " ")
    .trim();
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export async function generateStory(
  topic: string,
  duration: 30 | 60
): Promise<string> {
  const safeTopic = sanitizeTopic(topic);
  if (!safeTopic) throw new Error("Topic is empty after sanitization");

  const prompt = buildStoryPrompt(safeTopic, duration);
  const targetWords = duration === 30 ? 85 : 170;
  const minWords = duration === 30 ? 82 : 140;
  const maxWords = duration === 30 ? 100 : 200;

  const systemMsg: Message = {
    role: "system",
    content:
      "You are a viral TikTok scriptwriter. Output ONLY the raw spoken script. No titles, labels, or formatting. You MUST hit the exact word count specified in the prompt.",
  };

  for (const model of MODELS) {
    let messages: Message[] = [systemMsg, { role: "user", content: prompt }];

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const raw = await callGroq(model, messages);
      if (!raw) break;

      const script = cleanScript(raw);
      const words = countWords(script);
      console.log(`Script from ${model} (attempt ${attempt + 1}): ${words} words (need ${minWords}-${maxWords})`);

      if (words >= minWords && words <= maxWords) {
        return script;
      }

      if (words > maxWords) {
        const wordArr = script.split(/\s+/).filter(Boolean);
        const fullText = wordArr.join(" ");
        const lastDot = wordArr.slice(0, maxWords).join(" ").lastIndexOf(".");
        const cutoff = wordArr.slice(0, minWords).join(" ").length;
        const trimmed =
          lastDot > cutoff
            ? fullText.slice(0, lastDot + 1)
            : wordArr.slice(0, maxWords).join(" ");
        console.warn(`Trimmed from ${words} to fit ${maxWords} max`);
        return trimmed;
      }

      if (attempt < MAX_RETRIES) {
        const shortage = targetWords - words;
        console.warn(`Too short by ${shortage} words, retrying with feedback...`);
        messages = [
          systemMsg,
          { role: "user", content: prompt },
          { role: "assistant", content: raw },
          {
            role: "user",
            content: `That was only ${words} words. I need EXACTLY ${targetWords} words (minimum ${minWords}). You are ${shortage} words short. Please rewrite the COMPLETE script with MORE detail, longer sentences, and additional examples to reach ${targetWords} words. Output ONLY the spoken script, no explanations.`,
          },
        ];
      }
    }
  }

  throw new Error("All AI models are currently unavailable. Please try again in a minute.");
}
