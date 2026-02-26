import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import { supabase } from "../lib/supabase";
import { X } from "lucide-react";

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-md rounded-2xl bg-surface-card border border-white/10 p-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <h2 className="font-display text-2xl font-bold mb-6 text-center">
          Welcome to <span className="text-primary">Faceless</span>
        </h2>

        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: "#6c5ce7",
                  brandAccent: "#5a4bd1",
                  inputBackground: "#1a1a2e",
                  inputText: "white",
                  inputBorder: "rgba(255,255,255,0.1)",
                  inputBorderFocus: "#6c5ce7",
                  inputBorderHover: "rgba(255,255,255,0.2)",
                },
                borderWidths: {
                  buttonBorderWidth: "0px",
                  inputBorderWidth: "1px",
                },
                radii: {
                  borderRadiusButton: "12px",
                  buttonBorderRadius: "12px",
                  inputBorderRadius: "12px",
                },
              },
            },
            className: {
              container: "auth-container",
              button: "auth-button",
              input: "auth-input",
            },
          }}
          providers={[]}
          redirectTo={window.location.origin}
        />
      </div>
    </div>
  );
}
