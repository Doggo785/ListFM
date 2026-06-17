import { useEffect, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { motion } from "motion/react";
import Grainient from "../components/ui/Grainient";

function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState(null);

  useEffect(() => {
    document.title = "Signing In - ListFM";
  }, []);

  useEffect(() => {
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const err = searchParams.get("error");

    if (err) {
      setError(searchParams.get("error_description") || "Authentication failed. Please try again.");
      return;
    }

    if (code && state) {
      // Backend has already set httpOnly cookies via the redirect.
      // Simply redirect to dashboard.
      const timer = setTimeout(() => {
        navigate("/dashboard", { replace: true });
      }, 500);
      return () => clearTimeout(timer);
    }

    // No recognized params — treat as error
    setError("Invalid authentication response. Please try again.");
  }, [searchParams, navigate]);

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

        {error ? (
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
