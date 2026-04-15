import { Routes, Route, useLocation } from "react-router-dom";
import "./App.css";
import SearchHome from "./views/SearchHome";
import Dashboard from "./views/Dashboard";
import Playlist from "./views/Playlist";

function TopBar() {
  return (
    <header className="top-bar">
      <h1>ListFM</h1>
    </header>
  );
}

function App() {
  const location = useLocation();
  return (
    <div className="app-container">
      {location.pathname === "/" && <TopBar />}
      <div className="app-main">
        <Routes>
          <Route path="/" element={<SearchHome />} />
          <Route path="/dashboard/:username" element={<Dashboard />} />
          <Route path="/playlists" element={<Playlist />} />
        </Routes>
      </div>
    </div>
  );
}

export default App;
