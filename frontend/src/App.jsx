import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import "./App.css";
import AppSidebar from "./components/ui/AppSidebar";
import SearchHome from "./views/SearchHome";
import Dashboard from "./views/Dashboard";
import Playlist from "./views/Playlist";
import PlaylistNew from "./views/PlaylistNew";
import PlaylistDetail from "./views/PlaylistDetail";

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
      <div
        className={showSidebar ? "app-main app-main-with-sidebar" : "app-main"}
      >
        {showSidebar && <AppSidebar />}
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="h-full"
            >
              <Routes location={location}>
                <Route path="/" element={<SearchHome />} />
                <Route path="/dashboard/:username" element={<Dashboard />} />
                <Route path="/playlists" element={<Playlist />} />
                <Route path="/playlists/new" element={<PlaylistNew />} />
                <Route path="/playlists/:id" element={<PlaylistDetail />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default App;
