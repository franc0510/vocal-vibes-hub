import { useState } from "react";
import { motion } from "framer-motion";
import { Mail, Lock, User, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { nativeGoogleSignIn, nativeAppleSignIn } from "@/services/nativeAuthService";

const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(false);
  const [showEULA, setShowEULA] = useState(!isLogin);
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [pendingSignUp, setPendingSignUp] = useState<{ provider?: string; email?: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLogin && !eulaAccepted) {
      toast.error("You must accept the terms to continue");
      return;
    }
    setLoading(true);
    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Logged in!");
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: displayName },
            emailRedirectTo: window.location.origin,
          },
        });
        if (error) throw error;
        // Mark EULA as accepted
        const session = await supabase.auth.getSession();
        if (session.data.session?.user.id) {
          await (supabase as any).from("profiles").update({ eula_accepted: true, eula_accepted_at: new Date().toISOString() }).eq("id", session.data.session.user.id);
        }
        toast.success("Check your email to confirm your account!");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!isLogin && !eulaAccepted) {
      setShowEULA(true);
      setPendingSignUp({ provider: "google" });
      return;
    }
    setLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        // Native iOS/Android - use native auth service
        await nativeGoogleSignIn();
        toast.success("Signed in with Google!");
      } else {
        // Web fallback
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo: window.location.origin,
            queryParams: { access_type: "offline", prompt: "consent" },
          },
        });
        if (error) throw error;
      }
    } catch (err: any) {
      console.error("Google OAuth error:", err);
      toast.error(err.message || "Google sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    if (!isLogin && !eulaAccepted) {
      setShowEULA(true);
      setPendingSignUp({ provider: "apple" });
      return;
    }
    setLoading(true);
    try {
      if (Capacitor.isNativePlatform()) {
        // Native iOS/Android - use native auth service
        await nativeAppleSignIn();
        toast.success("Signed in with Apple!");
      } else {
        // Web fallback
        const { error } = await supabase.auth.signInWithOAuth({
          provider: "apple",
          options: {
            redirectTo: window.location.origin,
          },
        });
        if (error) throw error;
      }
    } catch (err: any) {
      console.error("Apple OAuth error:", err);
      toast.error(err.message || "Apple sign-in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <h1 className="text-3xl font-bold font-display text-gradient-red text-center mb-2">VocMe</h1>
        <p className="text-muted-foreground text-center text-sm mb-8">
          {isLogin ? "Welcome back 👋" : "Join the community 🎤"}
        </p>

        <div className="mb-6 space-y-3">
          <button
            onClick={handleGoogleSignIn}
            className="w-full flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground py-3 rounded-xl font-medium transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </button>

          <button
            onClick={handleAppleSignIn}
            className="w-full flex items-center justify-center gap-2 bg-secondary hover:bg-secondary/80 text-foreground py-3 rounded-xl font-medium transition-colors"
          >
            <span className="text-xl">🍎</span>
            Continue with Apple
          </button>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">or by email</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {!isLogin && (
            <div className="relative">
              <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Display name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full bg-secondary rounded-xl pl-10 pr-4 py-3 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
          )}
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-secondary rounded-xl pl-10 pr-4 py-3 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              className="w-full bg-secondary rounded-xl pl-10 pr-4 py-3 text-foreground placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          
          {!isLogin && (
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="eula"
                checked={eulaAccepted}
                onChange={(e) => setEulaAccepted(e.target.checked)}
                className="w-4 h-4 mt-1 rounded border-border bg-secondary cursor-pointer accent-primary"
              />
              <label htmlFor="eula" className="text-xs text-muted-foreground cursor-pointer">
                I agree to the{" "}
                <button
                  type="button"
                  onClick={() => setShowEULA(true)}
                  className="text-primary underline hover:opacity-80"
                >
                  Terms of Service
                </button>
                {" "}and confirm there is zero tolerance for abusive content
              </label>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || (!isLogin && !eulaAccepted)}
            className="w-full gradient-coral text-primary-foreground py-3 rounded-xl font-medium shadow-coral flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {loading && <Loader2 size={18} className="animate-spin" />}
            {isLogin ? "Log in" : "Create account"}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-6">
          {isLogin ? "Don't have an account?" : "Already have an account?"}{" "}
          <button onClick={() => { setIsLogin(!isLogin); setEulaAccepted(false); setShowEULA(!isLogin); }} className="text-primary font-medium">
            {isLogin ? "Sign up" : "Log in"}
          </button>
        </p>
      </motion.div>

      {/* EULA Modal */}
      {showEULA && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40 backdrop-blur-sm">
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            className="w-full bg-card rounded-t-3xl max-h-[85vh] overflow-y-auto flex flex-col"
          >
            <div className="sticky top-0 flex items-center justify-between p-4 border-b border-border/20 bg-card">
              <h2 className="text-lg font-bold text-foreground">Terms of Service & EULA</h2>
              <button
                onClick={() => setShowEULA(false)}
                className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 px-4 py-6 space-y-4 text-sm text-foreground/80 leading-relaxed">
              <section>
                <h3 className="font-bold text-foreground mb-2">1. Acceptable Use Policy</h3>
                <p>
                  VocMe is a platform for sharing vocal content. Users must comply with all applicable laws and regulations. Content that is abusive, defamatory, illegal, or otherwise harmful is strictly prohibited.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-foreground mb-2">2. Zero Tolerance for Abuse</h3>
                <p>
                  VocMe maintains a <strong>zero-tolerance policy</strong> for:
                </p>
                <ul className="list-disc pl-5 mt-1 space-y-1">
                  <li>Harassment, bullying, or threats</li>
                  <li>Hate speech, discrimination, or violence</li>
                  <li>Explicit sexual content or exploitation</li>
                  <li>Spam, phishing, or malicious content</li>
                  <li>Copyright or intellectual property violation</li>
                </ul>
              </section>

              <section>
                <h3 className="font-bold text-foreground mb-2">3. Content Moderation</h3>
                <p>
                  Our team will review and act on reported content within 24 hours. Violations of this policy will result in content removal and potential account suspension or permanent ban.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-foreground mb-2">4. User Blocking & Reporting</h3>
                <p>
                  Users can block other users or report inappropriate content directly from the app. These features help us maintain a safe community.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-foreground mb-2">5. Privacy & Data</h3>
                <p>
                  VocMe respects your privacy. We collect only essential account information (name, email, avatar) and will never share your data for advertising purposes without explicit consent.
                </p>
              </section>

              <section>
                <h3 className="font-bold text-foreground mb-2">6. Account Deletion</h3>
                <p>
                  You may delete your account and all associated data at any time through the app settings. This action is permanent and irreversible.
                </p>
              </section>

              <section className="pb-4">
                <p className="text-xs text-muted-foreground italic">
                  Last updated: June 2026. VocMe reserves the right to update these terms. Continued use of the app constitutes acceptance of the latest terms.
                </p>
              </section>
            </div>

            <div className="sticky bottom-0 p-4 border-t border-border/20 bg-card space-y-3">
              <button
                onClick={() => {
                  setEulaAccepted(true);
                  setShowEULA(false);
                  if (pendingSignUp?.provider) {
                    if (pendingSignUp.provider === "google") {
                      handleGoogleSignIn();
                    } else if (pendingSignUp.provider === "apple") {
                      handleAppleSignIn();
                    }
                  }
                }}
                className="w-full gradient-red text-primary-foreground py-3 rounded-xl font-medium shadow-red hover:opacity-90 transition-opacity"
              >
                I Agree & Continue
              </button>
              <button
                onClick={() => setShowEULA(false)}
                className="w-full bg-secondary text-foreground py-2 rounded-xl text-sm font-medium hover:bg-secondary/80 transition-colors"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default AuthPage;
