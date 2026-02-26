import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Session } from "@supabase/supabase-js";
import Navbar from "./components/Navbar";
import Hero from "./components/Hero";
import ResultsMarquee from "./components/ResultsMarquee";
import HowItWorks from "./components/HowItWorks";
import FAQ from "./components/FAQ";
import Footer from "./components/Footer";
import AuthModal from "./components/AuthModal";
import Preview from "./pages/Preview";
import Admin from "./pages/Admin";
import Dashboard from "./pages/Dashboard";
import { supabase } from "./lib/supabase";
import { checkIsAdmin, clearAdminCache } from "./lib/admin";

function LandingPage({
  session,
  isAdmin,
  onLogin,
  onLogout,
}: {
  session: Session | null;
  isAdmin: boolean;
  onLogin: () => void;
  onLogout: () => void;
}) {
  const [showAuth, setShowAuth] = useState(false);

  if (session) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-surface">
      <Navbar
        session={session}
        isAdmin={isAdmin}
        onLogin={() => {
          onLogin();
          setShowAuth(true);
        }}
        onLogout={onLogout}
      />
      <Hero onStart={() => setShowAuth(true)} />
      <ResultsMarquee />
      <HowItWorks />
      <FAQ />
      <Footer />
      {showAuth && <AuthModal onClose={() => setShowAuth(false)} />}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) checkIsAdmin().then(setIsAdmin);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      if (s) {
        checkIsAdmin().then(setIsAdmin);
      } else {
        setIsAdmin(false);
        clearAdminCache();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/"
          element={
            <LandingPage
              session={session}
              isAdmin={isAdmin}
              onLogin={() => {}}
              onLogout={() => supabase.auth.signOut()}
            />
          }
        />
        <Route
          path="/dashboard"
          element={
            <Dashboard
              session={session}
              isAdmin={isAdmin}
              onLogout={() => supabase.auth.signOut()}
            />
          }
        />
        <Route path="/preview/:jobId" element={<Preview />} />
        <Route path="/admin" element={<Admin session={session} />} />
      </Routes>
    </BrowserRouter>
  );
}
