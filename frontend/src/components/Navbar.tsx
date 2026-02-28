import { Session } from "@supabase/supabase-js";
import { Link, useLocation } from "react-router-dom";
import { Video, LogOut, LogIn, ShieldCheck, LayoutDashboard } from "lucide-react";

interface NavbarProps {
  session: Session | null;
  isAdmin: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

export default function Navbar({ session, isAdmin, onLogin, onLogout }: NavbarProps) {
  const location = useLocation();
  const isDashboard = location.pathname === "/dashboard";

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-xl border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <Video className="w-7 h-7 text-primary" />
          <span className="font-display text-xl font-bold tracking-tight">
            Invisible Creator<span className="text-primary">.video</span>
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {!session && (
            <a href="#faq" className="text-sm text-white/60 hover:text-white transition-colors hidden sm:block">
              FAQ
            </a>
          )}
          {session && (
            <Link
              to="/dashboard"
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                isDashboard
                  ? "text-primary"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <LayoutDashboard className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </Link>
          )}
          {session && isAdmin && (
            <Link
              to="/admin"
              className={`flex items-center gap-1.5 px-3 py-2 text-sm transition-colors ${
                location.pathname === "/admin"
                  ? "text-amber-400"
                  : "text-amber-400/80 hover:text-amber-400"
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="hidden sm:inline">Admin</span>
            </Link>
          )}
          {session ? (
            <button
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 text-sm text-white/70 hover:text-white border border-white/10 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </button>
          ) : (
            <button
              onClick={onLogin}
              className="flex items-center gap-2 px-5 py-2 text-sm font-semibold bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors"
            >
              <LogIn className="w-4 h-4" />
              Sign In
            </button>
          )}
        </div>
      </div>
    </nav>
  );
}
