import { useState, useEffect } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { motion } from "motion/react";
import { useAuth } from "../contexts/AuthContext";
import Grainient from "../components/ui/Grainient";
import { IconAlertCircle } from "@tabler/icons-react";

function LinkLastfm() {
  const [username, setUsername] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { linkLastfm, isLastfmLinked } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Link Last.fm - ListFM";
  }, []);

  // Fallback useEffect guard in case isLastfmLinked changes after mount
  useEffect(() => {
    if (isLastfmLinked) {
      navigate("/dashboard");
    }
  }, [isLastfmLinked, navigate]);

  // Render-level guard: redirect immediately if already linked
  // Must be here, before the form renders, to prevent any flash
  if (isLastfmLinked) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) {
      setError("Please enter your Last.fm username");
      return;
    }

    setLoading(true);
    try {
      await linkLastfm(username.trim());
      navigate("/dashboard");
    } catch (err) {
      setError(err.message || "Failed to link account. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-1 flex items-center justify-center bg-[#121212] min-h-screen px-4">
      <div className="absolute inset-0 overflow-hidden opacity-45">
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
        className="relative z-10 w-full max-w-sm space-y-8"
      >
        <div className="text-center">
          <Link
            to="/"
            className="inline-block mb-4 text-3xl font-black text-[#ff530b] hover:opacity-80 transition-opacity"
          >
            ListFM
          </Link>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Link your Last.fm account
          </h1>
          <p className="text-neutral-400 text-sm mt-2">
            Enter your Last.fm username to connect your listening history
          </p>
        </div>

        <motion.form
          onSubmit={handleSubmit}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="space-y-4"
        >
          {error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400"
            >
              <IconAlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </motion.div>
          )}

          <div className="space-y-1.5">
            <label
              htmlFor="lastfm-username"
              className="block text-xs font-medium text-neutral-400 uppercase tracking-wider"
            >
              Last.fm Username
            </label>
            <input
              id="lastfm-username"
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) setError("");
              }}
              placeholder="Last.fm username..."
              autoComplete="username"
              className="w-full rounded-lg border border-neutral-800 bg-neutral-900/50 px-4 py-2.5 text-sm text-white placeholder-neutral-600 outline-none transition-colors focus:border-[#ff530b]/50 focus:ring-1 focus:ring-[#ff530b]/20"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-[#ff530b] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#ff530b]/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <span className="h-4 w-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                Linking...
              </span>
            ) : (
              "Link Account"
            )}
          </button>
        </motion.form>
      </motion.div>
    </main>
  );
}

export default LinkLastfm;
