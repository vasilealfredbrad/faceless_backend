import { Eye } from "lucide-react";

const VIEW_COUNTS = [
  "1M", "1.1M", "608K", "327K", "274K", "114K", "67K", "55.9K",
  "58.6K", "43.8K", "37.2K", "27.1K", "36K", "37.4K", "60.9K",
  "56.7K", "60K", "58.1K", "46.1K", "44.7K", "34.7K", "25.8K",
];

function ViewCard({ count }: { count: string }) {
  const isMillion = count.includes("M");
  return (
    <div className="flex-shrink-0 w-36 h-52 rounded-xl bg-gradient-to-br from-surface-card to-surface-light border border-white/5 flex flex-col items-center justify-center gap-3 mx-2">
      <div className="w-12 h-12 rounded-full bg-primary/15 flex items-center justify-center">
        <Eye className={`w-5 h-5 ${isMillion ? "text-accent" : "text-primary-light"}`} />
      </div>
      <span className={`font-display text-xl font-bold ${isMillion ? "text-accent" : "text-white"}`}>
        {count}
      </span>
      <span className="text-xs text-white/40">views</span>
    </div>
  );
}

export default function ResultsMarquee() {
  const doubled = [...VIEW_COUNTS, ...VIEW_COUNTS];

  return (
    <section className="py-12 overflow-hidden">
      <p className="text-center text-sm font-semibold text-white/30 uppercase tracking-widest mb-8">
        Results from our autopilot creators
      </p>
      <div className="flex animate-marquee" style={{ width: "max-content" }}>
        {doubled.map((count, i) => (
          <ViewCard key={i} count={count} />
        ))}
      </div>
    </section>
  );
}
