import { buildStoryPrompt } from "../templates/story-prompt.js";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const REQUEST_TIMEOUT_MS = 30_000;

if (!OPENROUTER_API_KEY) {
  console.warn("WARNING: OPENROUTER_API_KEY not set. Script generation will fail.");
}

const FREE_MODELS = [
  "arcee-ai/trinity-large-preview:free",
  "nvidia/nemotron-nano-9b-v2:free",
  "meta-llama/llama-3.3-70b-instruct:free",
  "stepfun/step-3.5-flash:free",
  "z-ai/glm-4.5-air:free",
];

function sanitizeTopic(raw: string): string {
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/[^\w\s.,!?'"()-]/g, "")
    .slice(0, 500)
    .trim();
}

async function tryModel(model: string, prompt: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://faceless.video",
          "X-Title": "Faceless Video Generator",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are a viral TikTok scriptwriter. Output ONLY the raw spoken script. No titles, labels, or formatting.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.8,
          max_tokens: 500,
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

export async function generateStory(
  topic: string,
  duration: 30 | 60
): Promise<string> {
  const safeTopic = sanitizeTopic(topic);
  if (!safeTopic) throw new Error("Topic is empty after sanitization");

  const prompt = buildStoryPrompt(safeTopic, duration);
  const minWords = duration === 30 ? 50 : 100;
  const maxWords = duration === 30 ? 120 : 230;

  for (const model of FREE_MODELS) {
    const raw = await tryModel(model, prompt);
    if (!raw) continue;

    const script = cleanScript(raw);
    const words = script.split(/\s+/).filter(Boolean);
    console.log(`Script from ${model}: ${words.length} words (range: ${minWords}-${maxWords})`);

    if (words.length < minWords) {
      console.warn(`Too short (${words.length}), trying next model...`);
      continue;
    }

    if (words.length > maxWords) {
      const fullText = words.join(" ");
      const lastSentenceEnd = words.slice(0, maxWords).join(" ").lastIndexOf(".");
      const cutoff = words.slice(0, minWords).join(" ").length;
      const trimmed =
        lastSentenceEnd > cutoff
          ? fullText.slice(0, lastSentenceEnd + 1)
          : words.slice(0, maxWords).join(" ");
      console.warn(`Trimmed from ${words.length} words`);
      return trimmed;
    }

    return script;
  }

  throw new Error("All AI models are currently unavailable. Please try again in a minute.");
}
