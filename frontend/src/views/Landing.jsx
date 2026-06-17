import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import Grainient from "../components/ui/Grainient";

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "ListFM";
  }, []);

  return (
    <main className="homepage">
      <div className="homepage__bg">
        <Grainient
          color1="#FF6817"
          color2="#17AEFF"
          color3="#1c191c"
          timeSpeed={0.2}
          warpSpeed={1.5}
          grainAmount={0.06}
          contrast={1.2}
          saturation={0.8}
          zoom={1}
        />
      </div>

      <div className="homepage__content">
        <motion.div
          className="homepage__hero"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="homepage__brand">ListFM</h1>
          <p className="homepage__tagline">
            Your music, automated. Import your Last.fm listening history and
            build smart playlists.
          </p>
        </motion.div>

        <motion.div
          className="homepage__search"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{
            duration: 0.7,
            delay: 0.15,
            ease: [0.22, 1, 0.36, 1],
          }}
        >
          <div className="flex flex-col gap-3 w-full max-w-xs mx-auto">
            <button
              onClick={() => navigate("/login")}
              className="w-full px-6 py-3 rounded-lg bg-[#FF6817] text-white font-semibold text-sm hover:bg-[#e55c14] transition-colors cursor-pointer"
            >
              Sign In
            </button>
            <button
              onClick={() => navigate("/register")}
              className="w-full px-6 py-3 rounded-lg border border-white/20 text-white font-semibold text-sm hover:bg-white/10 transition-colors cursor-pointer"
            >
              Create Account
            </button>
          </div>
        </motion.div>

        <motion.div
          className="homepage__hint"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          <span>
            Connect your Last.fm account to get started
          </span>
        </motion.div>
      </div>
    </main>
  );
}

export default Landing;
