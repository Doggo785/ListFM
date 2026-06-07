import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "motion/react";
import SearchInput from "../components/ui/SearchBar";
import Grainient from "../components/ui/Grainient";

function SearchHome() {
  const [username, setUsername] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "ListFM";
  }, []);

  const handleSearch = () => {
    if (username.trim()) {
      navigate(`/dashboard/${username}`);
    }
  };

  return (
    <main className="homepage">
      <div className="homepage__bg">
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

      <div className="homepage__content">
        <motion.div
          className="homepage__hero"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <h1 className="homepage__brand">ListFM</h1>
          <p className="homepage__tagline">
            Create automated playlists that evolve with your listening habits
          </p>
        </motion.div>

        <motion.div
          className="homepage__search"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          <SearchInput
            value={username}
            onChange={setUsername}
            onSearch={handleSearch}
          />
        </motion.div>

        <motion.div
          className="homepage__hint"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.7, delay: 0.4 }}
        >
          <span>Start by entering your Last.fm username</span>
        </motion.div>
      </div>
    </main>
  );
}

export default SearchHome;
