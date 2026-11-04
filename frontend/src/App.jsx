import { Routes, Route, useLocation } from "react-router-dom";
import "./App.css";
import TopNav from "./components/ui/TopNav";
import PixelRibbon from "./components/ui/PixelRibbon";
import ScrollToTop from "./components/elements/ScrollToTop";
import SyncBanner from "./components/elements/SyncBanner";
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

const NO_NAV_PATHS = ["/", "/login", "/register", "/auth/callback", "/link-lastfm"];

function App() {
  const location = useLocation();
  const showNav = !NO_NAV_PATHS.includes(location.pathname);

  return (
    <div className="app-container">
      <ScrollToTop />
      <PixelRibbon />
      {showNav && <TopNav />}
      <div className="app-main">
        <div className="min-w-0 flex-1">
          {showNav && <SyncBanner />}
          {/* The new page is there at once: nothing waits for the old one to leave. */}
          <div key={location.pathname} className="page-enter h-full">
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
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
