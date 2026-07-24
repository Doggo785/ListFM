import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "motion/react";
import Grainient from "../components/ui/Grainient";
import { useAuth } from "../contexts/AuthContext";

function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { isLastfmLinked } = useAuth();
  const [error, setError] = useState(null);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsEmail, setNeedsEmail] = useState(false);

  useEffect(() => {
    document.title = "Signing In - ListFM";
  }, []);

  useEffect(() => {
    const err = searchParams.get("error");
    const needsEmailParam = searchParams.get("needs_email");

    if (needsEmailParam === "1") {
      setNeedsEmail(true);
      return;
    }

    if (err) {
      setError(searchParams.get("error_description") || "Authentication failed. Please try again.");
      return;
    }

    setError("Invalid authentication response. Please try again.");
  }, [searchParams, navigate]);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    if (!email.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const resp = await fetch("/api/auth/oauth/complete-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to save email. Please try again.");
      }

      // If the user already has a linked Last.fm account, skip the linking page
      if (isLastfmLinked) {
        navigate("/dashboard", { replace: true });
      } else {
        navigate("/link-lastfm", { replace: true });
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="flex-1 flex items-center justify-center bg-[#121212] min-h-screen px-4">
      <div className="absolute inset-0 overflow-hidden">
        <Grainient
          color1="#FF6817"
          color2="#17AEFF"
          color3="#1c191c"
          timeSpeed={0.2}
          colorBalance={0}
          warpStrength={1}
          warpFrequency={5}
          warpSpeed={1.5}
          warpAmplitude={50}
          blendAngle={0}
          blendSoftness={0.05}
          rotationAmount={500}
          noiseScale={2}
          grainAmount={0.06}
          grainScale={2}
          grainAnimated={false}
          contrast={1.2}
          gamma={1}
          saturation={0.8}
          centerX={0}
          centerY={0}
          zoom={1}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 text-center space-y-6"
      >
        <Link
          to="/"
          className="inline-block text-3xl font-black text-[#ff530b] hover:opacity-80 transition-opacity"
        >
          ListFM
        </Link>

        {needsEmail ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-lg font-semibold text-white">Complete Your Account</h2>
              <p className="text-neutral-400 text-sm">
                Discord didn&apos;t provide an email. Enter one to continue.
              </p>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4 max-w-sm mx-auto">
              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400"
                >
                  {error}
                </motion.div>
              )}

              <div className="space-y-1.5 text-left">
                <label
                  htmlFor="oauth-email"
                  className="block text-xs font-medium text-neutral-400 uppercase tracking-wider"
                >
                  Email Address
                </label>
                <input
                  id="oauth-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (error) setError(null);
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-[#ff530b]/50 focus:ring-1 focus:ring-[#ff530b]/20"
                  disabled={submitting}
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#ff530b] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#ff530b]/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                    Saving...
                  </span>
                ) : (
                  "Continue"
                )}
              </button>
            </form>
          </div>
        ) : error ? (
          <>
            <p className="text-red-400 text-sm">{error}</p>
            <Link
              to="/login"
              className="inline-block text-sm text-[#17AEFF] hover:text-[#17AEFF]/80 transition-colors font-medium"
            >
              Back to Sign In
            </Link>
          </>
        ) : (
          <div className="flex items-center justify-center gap-3 text-neutral-400 text-sm">
            <span className="h-4 w-4 rounded-full border-2 border-[#ff530b] border-t-transparent animate-spin" />
            Completing sign in...
          </div>
        )}
      </motion.div>
    </main>
  );
}

export default AuthCallback;
