import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Loader from "../components/elements/Loader";
import Card from "../components/ui/Card";

function Dashboard() {
  const { username } = useParams();
  const navigate = useNavigate();

  const [playlist, setPlaylist] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchRecentTracks = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `http://localhost:8000/api/recent-tracks/${username}`,
        );
        if (!response.ok)
          throw new Error("Network error: Failed to fetch recent tracks");

        const data = await response.json();
        setPlaylist(data.tracks);
      } catch (error) {
        setError("Failed to fetch recent tracks");
        console.error("Error fetching recent tracks:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchRecentTracks();
  }, [username]);
  if (isLoading) {
    return (
      <main className="main-content" style={{ justifyContent: "center" }}>
        <Loader />
      </main>
    );
  }

  if (error) {
    return (
      <main className="main-content" style={{ justifyContent: "center" }}>
        <h2 style={{ color: "#FF5900" }}>{error}</h2>
        <button
          onClick={() => navigate("/")}
          style={{ padding: "10px 20px", marginTop: "1rem", cursor: "pointer" }}
        >
          Retour
        </button>
      </main>
    );
  }

  return (
    <main className="main-content">
      <div
        style={{
          width: "100%",
          maxWidth: "1000px",
          backgroundColor: "rgba(0,0,0,0.5)",
          padding: "2rem",
          borderRadius: "15px",
          color: "white",
        }}
      >
        <h2>
          Dashboard de <span style={{ color: "#17AEFF" }}>{username}</span>
        </h2>

        <div style={{ marginTop: "2rem" }}>
          <h3>Historique brut ({playlist.length} éléments)</h3>
          {/* Rendu temporaire de ta liste. À remplacer par Recharts plus tard. */}
          <pre
            style={{
              background: "#111",
              padding: "1rem",
              borderRadius: "8px",
              overflowX: "auto",
            }}
          >
            {playlist.map((track, index) => (
              <div key={index}>
                <Card neonColor="orange" className="mb-4">
                  <strong>{track.title}</strong> - {track.artist}
                </Card>
              </div>
            ))}
          </pre>
        </div>

        <button
          onClick={() => navigate("/")}
          style={{ padding: "10px 20px", marginTop: "2rem", cursor: "pointer" }}
        >
          Nouvelle recherche
        </button>
      </div>
    </main>
  );
}

export default Dashboard;
