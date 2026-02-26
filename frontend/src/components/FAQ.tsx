import { useState } from "react";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "Do I need to make videos for this to work?",
    a: "Not at all! Our AI handles everything — from writing the script to generating the voiceover and assembling the final video. You just provide the topic.",
  },
  {
    q: "What if I want to edit a video before posting?",
    a: "Every video is available for download before you post it anywhere. You can review, edit in your favorite editor, or post it as-is.",
  },
  {
    q: "What video formats are supported?",
    a: "We generate videos in 9:16 TikTok/Reels/Shorts format (1080x1920) as MP4 files, ready for any short-form platform.",
  },
  {
    q: "How long does it take to generate a video?",
    a: "Typically 30-60 seconds depending on the video length. The AI writes the script, generates the voiceover, and assembles everything automatically.",
  },
  {
    q: "What voices are available?",
    a: "We offer a wide range of natural-sounding voices through Unreal Speech — including American, Chinese, Spanish, French, Hindi, Italian, and Portuguese voices in both male and female options.",
  },
];

export default function FAQ() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section id="faq" className="py-20 px-4">
      <div className="max-w-2xl mx-auto">
        <h2 className="font-display text-3xl sm:text-4xl font-bold text-center mb-12">
          Frequently Asked <span className="text-primary">Questions</span>
        </h2>

        <div className="space-y-3">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              className="rounded-xl border border-white/5 bg-surface-card overflow-hidden"
            >
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="w-full flex items-center justify-between p-5 text-left"
              >
                <span className="font-semibold text-sm pr-4">{faq.q}</span>
                <ChevronDown
                  className={`w-5 h-5 text-white/40 flex-shrink-0 transition-transform ${
                    open === i ? "rotate-180" : ""
                  }`}
                />
              </button>
              {open === i && (
                <div className="px-5 pb-5 text-sm text-white/50 leading-relaxed">
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
