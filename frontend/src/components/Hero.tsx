import { Sparkles, Play, Zap, Clock, Shield } from "lucide-react";

interface HeroProps {
  onStart: () => void;
}

export default function Hero({ onStart }: HeroProps) {
  return (
    <section className="pt-28 pb-16 px-4">
      <div className="max-w-3xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium">
          <Sparkles className="w-4 h-4" />
          Fast AI Video Engine
        </div>

        <h1 className="font-display text-5xl sm:text-6xl lg:text-7xl font-black leading-[1.05] tracking-tight mb-6">
          Launch Viral Content{" "}
          <span className="bg-gradient-to-r from-primary via-primary-light to-accent bg-clip-text text-transparent">
            in Seconds
          </span>
        </h1>

        <p className="text-lg sm:text-xl text-white/50 max-w-xl mx-auto mb-10 leading-relaxed">
          Turn one idea into bulk, ready-to-post videos in seconds. Script,
          voiceover, subtitles, and final render are all handled automatically
          so you can publish more, faster.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
          <button
            onClick={onStart}
            className="group flex items-center gap-3 px-8 py-4 bg-primary hover:bg-primary-dark text-white font-bold rounded-2xl transition-all text-lg shadow-lg shadow-primary/25 hover:shadow-primary/40 hover:scale-[1.02]"
          >
            <Play className="w-5 h-5 transition-transform group-hover:scale-110" />
            Generate My First Video
          </button>
          <p className="text-sm text-white/40">
            No credit card required
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg mx-auto">
          <div className="flex items-center justify-center gap-2 text-white/40 text-sm">
            <Zap className="w-4 h-4 text-accent" />
            <span>15 free videos/day</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-white/40 text-sm">
            <Clock className="w-4 h-4 text-accent" />
            <span>Bulk generation in seconds</span>
          </div>
          <div className="flex items-center justify-center gap-2 text-white/40 text-sm">
            <Shield className="w-4 h-4 text-accent" />
            <span>Built to scale channels</span>
          </div>
        </div>
      </div>
    </section>
  );
}
