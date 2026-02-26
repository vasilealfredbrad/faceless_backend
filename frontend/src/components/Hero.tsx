import { Sparkles, Play } from "lucide-react";

interface HeroProps {
  onStart: () => void;
}

export default function Hero({ onStart }: HeroProps) {
  return (
    <section className="pt-28 pb-16 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
          <Sparkles className="w-4 h-4" />
          AI-Powered Video Creation
        </div>

        <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight mb-6">
          Create Faceless Videos in{" "}
          <span className="bg-gradient-to-r from-primary via-primary-light to-accent bg-clip-text text-transparent">
            One Click
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-white/50 max-w-xl mx-auto mb-10 leading-relaxed">
          Use AI to automatically generate custom TikTok videos. Write the
          script, create the voiceover, and assemble the video — all in seconds.
        </p>

        <button
          onClick={onStart}
          className="group inline-flex items-center gap-3 px-8 py-4 bg-primary hover:bg-primary-dark text-white font-bold text-lg rounded-2xl transition-all animate-pulse-glow"
        >
          <Play className="w-5 h-5 fill-current" />
          START FOR FREE
        </button>
      </div>
    </section>
  );
}
