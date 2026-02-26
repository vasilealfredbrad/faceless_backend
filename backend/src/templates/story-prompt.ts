export function buildStoryPrompt(topic: string, duration: 30 | 60): string {
  const wordCount = duration === 30 ? 85 : 170;
  const structure =
    duration === 30
      ? `STRUCTURE (30 seconds):
- Hook (first ~10 words): One punchy opening line that stops the scroll.
- Setup (next ~20 words): Establish the context quickly.
- Core Message (next ~40 words): Deliver the main value or insight. Conversational and engaging.
- Closer (last ~15 words): End with a twist or thought-provoking line.`
      : `STRUCTURE (60 seconds):
- Hook (first ~10 words): One punchy opening line that stops the scroll.
- Setup (next ~25 words): Establish the context. Paint a vivid picture.
- Rising Tension (next ~45 words): Build stakes. Introduce conflict or curiosity.
- Climax (next ~50 words): The payoff. Deliver the revelation or core insight.
- Closer (last ~40 words): Wrap up with a memorable, powerful ending.`;

  return `You are an elite TikTok scriptwriter for faceless video channels.

TOPIC: "${topic}"
TARGET: ${wordCount} words (will be spoken aloud as a ${duration}-second voiceover)

${structure}

Write approximately ${wordCount} words. Use conversational, natural language — write how people actually talk. Vary sentence length for rhythm. No hashtags, emojis, stage directions, brackets, labels, or titles.

OUTPUT: Return ONLY the spoken words. Nothing else.`;
}
