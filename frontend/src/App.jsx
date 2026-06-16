import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import "./App.css";
import AppSidebar from "./components/ui/AppSidebar";
import ScrollToTop from "./components/elements/ScrollToTop";
import SearchHome from "./views/SearchHome";
import Login from "./views/Login";
import Register from "./views/Register";
import Dashboard from "./views/Dashboard";
import PlaylistNew from "./views/PlaylistNew";
import PlaylistDetail from "./views/PlaylistDetail";
import AuthGuard from "./components/AuthGuard";

function getLastUsername() {
  try {
    const currentUsername = sessionStorage.getItem("listfm_current_username");
    if (currentUsername) return currentUsername;
    
    const data = JSON.parse(localStorage.getItem("listfm_last_visit") || "{}");
    const usernames = Object.keys(data);
    return usernames.length > 0 ? usernames[usernames.length - 1] : null;
  } catch {
    return null;
  }
}

function getUsernameFromPath(pathname) {
  const match = pathname.match(/^\/dashboard\/([^/]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function App() {
  const location = useLocation();
  const showSidebar = location.pathname !== "/" && location.pathname !== "/login" && location.pathname !== "/register";
  const usernameFromUrl = getUsernameFromPath(location.pathname);
  const lastUsername = getLastUsername();

  return (
    <div className="app-container">
      <ScrollToTop />
      <div
        className={showSidebar ? "app-main app-main-with-sidebar" : "app-main"}
      >
        {showSidebar && (
          <AppSidebar username={usernameFromUrl || lastUsername} />
        )}
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
                <Route
                  path="/dashboard/:username"
                  element={
                    <AuthGuard>
                      <Dashboard />
                    </AuthGuard>
                  }
                />
                <Route
                  path="/playlists"
                  element={
                    <Navigate
                      to={lastUsername ? `/dashboard/${lastUsername}` : "/"}
                      replace
                    />
                  }
                />
                <Route
                  path="/playlists/new"
                  element={
                    <AuthGuard>
                      <PlaylistNew />
                    </AuthGuard>
                  }
                />
                <Route
                  path="/playlists/:id"
                  element={
                    <AuthGuard>
                      <PlaylistDetail />
                    </AuthGuard>
                  }
                />
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default App;
