import { Routes, Route, useLocation } from "react-router-dom";
import "./App.css";
import AppSidebar from "./components/ui/AppSidebar";
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
  const showSidebar = location.pathname !== "/";
  return (
    <div className="app-container">
      {location.pathname === "/" && <TopBar />}
      <div
        className={showSidebar ? "app-main app-main-with-sidebar" : "app-main"}
      >
        {showSidebar && <AppSidebar />}
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
