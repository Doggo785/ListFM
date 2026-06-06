import { useState } from "react";
import { useNavigate } from "react-router-dom";
import SearchInput from "../components/ui/SearchBar";
import Grainient from "../components/ui/Grainient";

function SearchHome() {
  const [username, setUsername] = useState("");
  const navigate = useNavigate();

  const handleSearch = () => {
    if (username.trim()) {
      navigate(`/dashboard/${username}`);
      return;
    }
  };

  return (
    <main className="main-content" style={{ position: "relative" }}>
      <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
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
      <div className="search-section" style={{ position: "relative", zIndex: 1 }}>
        <SearchInput
          value={username}
          onChange={setUsername}
          onSearch={handleSearch}
        />
      </div>
    </main>
  );
}

export default SearchHome;
