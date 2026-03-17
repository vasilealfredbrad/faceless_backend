import { useState } from "react";
import { supabase } from "../lib/supabase";
import { X, Mail, Lock, Check, Loader2, UserPlus, LogIn } from "lucide-react";

export type AuthMode = "login" | "register";

interface AuthModalProps {
  mode: AuthMode;
  onClose: () => void;
  onSwitchMode: (mode: AuthMode) => void;
}

export default function AuthModal({ mode, onClose, onSwitchMode }: AuthModalProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isRegister = mode === "register";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) {
      setError("Email and password are required");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (isRegister) {
        const { error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-surface-card border border-white/10 p-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center justify-center gap-3 mb-6">
          {isRegister ? (
            <UserPlus className="w-6 h-6 text-primary" />
          ) : (
            <LogIn className="w-6 h-6 text-primary" />
          )}
          <h2 className="font-display text-2xl font-bold">
            {isRegister ? "Create Account" : "Welcome Back"}
          </h2>
        </div>

        {isRegister && (
          <div className="flex flex-col gap-2 mb-6 px-1">
            {["15 free videos per day", "No credit card required", "Cancel anytime"].map((text) => (
              <div key={text} className="flex items-center gap-2 text-sm text-white/50">
                <Check className="w-4 h-4 text-accent flex-shrink-0" />
                {text}
              </div>
            ))}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-1.5">
              <Mail className="w-4 h-4" />
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-3 rounded-xl bg-surface border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50 transition-colors text-sm"
              disabled={loading}
              autoFocus
            />
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-white/70 mb-1.5">
              <Lock className="w-4 h-4" />
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isRegister ? "Create a password (min 6 chars)" : "Enter your password"}
              className="w-full px-4 py-3 rounded-xl bg-surface border border-white/10 text-white placeholder:text-white/25 focus:outline-none focus:border-primary/50 transition-colors text-sm"
              disabled={loading}
            />
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white font-bold rounded-xl transition-colors text-sm"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isRegister ? (
              "Create account — it's free"
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="mt-5 text-center">
          {isRegister ? (
            <p className="text-sm text-white/40">
              Already have an account?{" "}
              <button
                onClick={() => { onSwitchMode("login"); setError(""); }}
                className="text-primary hover:text-primary-light font-semibold transition-colors"
              >
                Sign In
              </button>
            </p>
          ) : (
            <p className="text-sm text-white/40">
              Don't have an account?{" "}
              <button
                onClick={() => { onSwitchMode("register"); setError(""); }}
                className="text-primary hover:text-primary-light font-semibold transition-colors"
              >
                Create one free
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
