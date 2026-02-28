import { Video } from "lucide-react";

export default function Footer() {
  return (
    <footer className="border-t border-white/5 py-8 px-4">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-white/40">
          <Video className="w-5 h-5" />
          <span className="text-sm">&copy; 2026 invisiblecreator.video</span>
        </div>
        <div className="flex items-center gap-6 text-sm text-white/30">
          <a href="#faq" className="hover:text-white/60 transition-colors">
            FAQ
          </a>
          <a href="#generator" className="hover:text-white/60 transition-colors">
            Generator
          </a>
        </div>
      </div>
    </footer>
  );
}
