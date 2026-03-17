const BANNED_WORDS = [
  "fuck", "shit", "ass", "bitch", "bastard", "damn", "dick", "cock",
  "pussy", "cunt", "whore", "slut", "fag", "faggot", "nigger", "nigga",
  "retard", "retarded", "rape", "rapist", "molest", "pedophile",
  "killyourself", "kys", "nazi", "holocaust",
];

const LEET_MAP: Record<string, string> = {
  "@": "a", "4": "a", "8": "b", "(": "c", "3": "e",
  "1": "i", "!": "i", "|": "i", "0": "o", "5": "s",
  "$": "s", "7": "t", "+": "t",
};

function deobfuscate(text: string): string {
  let result = "";
  for (const ch of text) {
    result += LEET_MAP[ch] || ch;
  }
  return result
    .replace(/[^a-z]/gi, "")
    .toLowerCase();
}

export function containsProfanity(text: string): boolean {
  const normalized = deobfuscate(text);
  return BANNED_WORDS.some((word) => normalized.includes(word));
}

export function validateTopicProfanity(topic: string): string | null {
  if (containsProfanity(topic)) {
    return "Topic contains inappropriate language. Please rephrase.";
  }
  return null;
}
