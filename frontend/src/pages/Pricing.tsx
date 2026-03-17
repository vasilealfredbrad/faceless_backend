import { useState, useEffect } from "react";
import { Session } from "@supabase/supabase-js";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import AuthModal, { type AuthMode } from "../components/AuthModal";
import { createStripeCheckout, createStripePortal, getMyProfile, UserProfile } from "../lib/api";
import {
  Check,
  Crown,
  Zap,
  Rocket,
  ArrowRight,
  Loader2,
  Video,
} from "lucide-react";

interface Props {
  session: Session | null;
  isAdmin: boolean;
  onLogout: () => void;
}

const PLANS = [
  {
    id: "starter" as const,
    name: "Starter",
    price: "$9",
    period: "/mo",
    monthlyTotal: "60 videos/month",
    icon: Zap,
    color: "primary",
    features: [
      "15 videos per week",
      "HD quality",
      "Background library",
      "Auto posting (coming soon)",
    ],
  },
  {
    id: "growth" as const,
    name: "Growth",
    price: "$30",
    period: "/mo",
    monthlyTotal: "300 videos/month",
    icon: Rocket,
    color: "accent",
    popular: true,
    features: [
      "Everything in Starter",
      "75 videos per week",
      "All voices",
      "Scheduling (coming soon)",
      "Priority generation",
      "Advanced analytics (soon)",
    ],
  },
  {
    id: "creator" as const,
    name: "Creator",
    price: "$50",
    period: "/mo",
    monthlyTotal: "1000 videos/month",
    icon: Crown,
    color: "amber-400",
    features: [
      "Everything in Growth",
      "250 videos per week",
      "All voices",
      "Bulk generation",
      "Content creation tools",
      "Edit in advance",
      "Advanced analytics (soon)",
      "Remake ability (for free)",
      "Custom menu options",
      "Priority support",
    ],
  },
];

export default function Pricing({ session, isAdmin, onLogout }: Props) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);

  useEffect(() => {
    if (session) {
      getMyProfile().then(setProfile).catch(() => {});
    }
  }, [session]);

  async function handleSubscribe(plan: "starter" | "growth" | "creator") {
    if (!session) {
      setAuthMode("register");
      return;
    }

    setLoading(plan);
    setError("");
    try {
      const url = await createStripeCheckout(plan);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setLoading(null);
    }
  }

  async function handleManageSubscription() {
    setLoading("portal");
    try {
      const url = await createStripePortal();
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open portal");
      setLoading(null);
    }
  }

  return (
    <div className="min-h-screen bg-surface">
      <Navbar
        session={session}
        isAdmin={isAdmin}
        onOpenAuth={(mode) => setAuthMode(mode)}
        onLogout={onLogout}
      />

      <main className="pt-20 pb-8 px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-8">
            <h1 className="font-display text-3xl sm:text-4xl font-black mb-3">
              Scale Your Content{" "}
              <span className="bg-gradient-to-r from-primary via-primary-light to-accent bg-clip-text text-transparent">
                Effortlessly
              </span>
            </h1>
            <p className="text-base text-white/50 max-w-xl mx-auto">
              Start free with 15 videos per day. Upgrade when you're ready to grow.
            </p>
          </div>

          {/* Free tier info */}
          <div className="max-w-3xl mx-auto mb-6 rounded-xl bg-surface-card border border-white/5 px-4 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-2 min-w-0 flex-1">
                <Video className="w-4 h-4 text-white/60 flex-shrink-0" />
                <span className="font-display font-bold text-base">Free Plan</span>
                <span className="text-white/40 text-sm">
                  Temporary free phase: 15 videos per day - no credit card needed
                </span>
              </div>
            {!session ? (
              <button
                onClick={() => setAuthMode("register")}
                className="px-4 py-1.5 text-xs font-semibold text-primary border border-primary/30 rounded-lg hover:bg-primary/10 transition-colors"
              >
                Get Started Free
              </button>
            ) : profile?.tier === "free" ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
                <Check className="w-3 h-3" />Current Plan
              </span>
            ) : null}
            </div>
          </div>

          {/* Plan cards */}
          <div className="grid md:grid-cols-3 gap-4 mb-6">
            {PLANS.map((plan) => {
              const isCurrentPlan = profile?.tier === plan.id;
              const Icon = plan.icon;
              const isPaid = profile && profile.tier !== "free";

              return (
                <div
                  key={plan.id}
                  className={`relative rounded-2xl bg-surface-card border p-5 flex flex-col ${
                    plan.popular
                      ? "border-accent/40 shadow-[0_0_30px_rgba(0,206,201,0.1)]"
                      : "border-white/5"
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-accent text-white text-xs font-bold rounded-full uppercase tracking-wider">
                      Most Popular
                    </div>
                  )}

                  <div className="mb-4">
                    <div className={`w-10 h-10 rounded-xl bg-${plan.color}/10 flex items-center justify-center mb-3`}>
                      <Icon className={`w-5 h-5 text-${plan.color}`} />
                    </div>
                    <h3 className="font-display text-xl font-bold mb-1">{plan.name}</h3>
                    <div className="flex items-baseline gap-1">
                      <span className="font-display text-3xl font-black">{plan.price}</span>
                      <span className="text-white/40 text-sm">{plan.period}</span>
                    </div>
                  <p className="mt-1 text-xs text-white/35">
                    Total monthly: {plan.monthlyTotal}
                  </p>
                  </div>

                  <ul className="space-y-2 mb-6 flex-1">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5 text-xs text-white/70">
                        <Check className={`w-4 h-4 mt-0.5 flex-shrink-0 text-${plan.color}`} />
                        {f}
                      </li>
                    ))}
                  </ul>

                  {isCurrentPlan ? (
                    <button
                      onClick={handleManageSubscription}
                      disabled={loading === "portal"}
                      className="w-full py-3 text-sm font-semibold border border-white/10 rounded-xl text-white/60 hover:text-white hover:border-white/20 transition-colors"
                    >
                      {loading === "portal" ? (
                        <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                      ) : (
                        "Manage Subscription"
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSubscribe(plan.id)}
                      disabled={loading === plan.id}
                      className={`w-full flex items-center justify-center gap-2 py-3 text-sm font-bold rounded-xl transition-colors ${
                        plan.popular
                          ? "bg-accent hover:bg-accent/80 text-white"
                          : "bg-primary hover:bg-primary-dark text-white"
                      } disabled:opacity-50`}
                    >
                      {loading === plan.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          {isPaid ? "Switch Plan" : "Subscribe"}
                          <ArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {error && (
            <div className="max-w-md mx-auto p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm text-center">
              {error}
            </div>
          )}
        </div>
      </main>

      <Footer />
      {authMode && (
        <AuthModal
          mode={authMode}
          onClose={() => setAuthMode(null)}
          onSwitchMode={setAuthMode}
        />
      )}
    </div>
  );
}
