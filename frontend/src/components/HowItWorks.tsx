import { Settings, Zap, TrendingUp } from "lucide-react";

const STEPS = [
  {
    icon: Settings,
    title: "Set It",
    description:
      "Enter your topic, pick a voice and background. Customize your video in just a few clicks.",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    icon: Zap,
    title: "Forget It",
    description:
      "Our AI writes the script, generates the voiceover, and assembles the video automatically.",
    color: "text-accent",
    bg: "bg-accent/10",
  },
  {
    icon: TrendingUp,
    title: "Watch It Grow",
    description:
      "Download your video and post it. Sit back and watch your views and followers soar.",
    color: "text-accent-light",
    bg: "bg-accent-light/10",
  },
];

export default function HowItWorks() {
  return (
    <section className="py-20 px-4">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-center mb-4">
          Run Your Channels on{" "}
          <span className="text-primary">Autopilot</span>
        </h2>
        <p className="text-center text-white/40 mb-14 max-w-lg mx-auto">
          Your own personal content creation team — creating and growing your
          channels effortlessly.
        </p>

        <div className="grid md:grid-cols-3 gap-6">
          {STEPS.map((step) => (
            <div
              key={step.title}
              className="p-8 rounded-2xl bg-surface-card border border-white/5 hover:border-primary/20 transition-colors group"
            >
              <div
                className={`w-14 h-14 rounded-xl ${step.bg} flex items-center justify-center mb-5`}
              >
                <step.icon className={`w-7 h-7 ${step.color}`} />
              </div>
              <h3 className="font-display text-xl font-bold mb-3">
                {step.title}
              </h3>
              <p className="text-white/50 leading-relaxed text-sm">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
