export function buildStoryPrompt(topic: string, duration: 30 | 60): string {
  const wordCount = duration === 30 ? 85 : 170;
  const minWords = duration === 30 ? 75 : 150;
  const maxWords = duration === 30 ? 95 : 190;

  const structure =
    duration === 30
      ? `STRUCTURE (30 seconds — ${wordCount} words total):
- Hook (first 10 words): One punchy opening line that stops the scroll.
- Setup (next 20 words): Establish the context quickly.
- Core Message (next 40 words): Deliver the main value or insight. Conversational and engaging.
- Closer (last 15 words): End with a twist or thought-provoking line.`
      : `STRUCTURE (60 seconds — ${wordCount} words total):
- Hook (first 10 words): One punchy opening line that stops the scroll.
- Setup (next 25 words): Establish the context. Paint a vivid picture.
- Rising Tension (next 45 words): Build stakes. Introduce conflict or curiosity.
- Climax (next 50 words): The payoff. Deliver the revelation or core insight.
- Closer (last 40 words): Wrap up with a memorable, powerful ending.`;

  return `You are an elite TikTok scriptwriter for faceless video channels.

TOPIC: "${topic}"

CRITICAL WORD COUNT REQUIREMENT:
- You MUST write EXACTLY ${wordCount} words. Not approximately — EXACTLY ${wordCount} words.
- The MINIMUM is ${minWords} words. The MAXIMUM is ${maxWords} words.
- This script will be read aloud as a ${duration}-second voiceover at ~2.5 words per second.
- If the script is too short, the voiceover will not fill the video and it will fail.
- Count your words carefully before responding.

${structure}

STYLE RULES:
- Use conversational, natural language — write how people actually talk.
- Vary sentence length for rhythm.
- No hashtags, emojis, stage directions, brackets, labels, section headers, or titles.
- Do NOT include words like "Hook:", "Setup:", "Climax:", etc.

OUTPUT: Return ONLY the spoken words. Nothing else. No preamble, no explanation, no word count.`;
}
