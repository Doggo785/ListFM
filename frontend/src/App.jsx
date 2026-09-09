import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import "./App.css";
import AppSidebar from "./components/ui/AppSidebar";
import ScrollToTop from "./components/elements/ScrollToTop";
import Landing from "./views/Landing";
import Login from "./views/Login";
import Register from "./views/Register";
import Dashboard from "./views/Dashboard";
import AuthCallback from "./views/AuthCallback";
import LinkLastfm from "./views/LinkLastfm";
import PlaylistNew from "./views/PlaylistNew";
import PlaylistDetail from "./views/PlaylistDetail";
import Playlists from "./views/Playlists";
import AuthGuard from "./components/AuthGuard";

function App() {
  const location = useLocation();
  const showSidebar =
    location.pathname !== "/" &&
    location.pathname !== "/login" &&
    location.pathname !== "/register" &&
    location.pathname !== "/auth/callback" &&
    location.pathname !== "/link-lastfm";

  return (
    <div className="app-container">
      <ScrollToTop />
      <div
        className={showSidebar ? "app-main app-main-with-sidebar" : "app-main"}
      >
        {showSidebar && (
          <AppSidebar />
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
                <Route path="/" element={<Landing />} />
                <Route
                  path="/dashboard"
                  element={
                    <AuthGuard>
                      <Dashboard />
                    </AuthGuard>
                  }
                />
                <Route
                  path="/playlists"
                  element={
                    <AuthGuard>
                      <Playlists />
                    </AuthGuard>
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
                <Route path="/auth/callback" element={<AuthCallback />} />
                <Route
                  path="/link-lastfm"
                  element={
                    <AuthGuard>
                      <LinkLastfm />
                    </AuthGuard>
                  }
                />
              </Routes>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default App;
