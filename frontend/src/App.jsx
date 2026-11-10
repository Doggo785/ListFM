import { Suspense, lazy, useEffect, useState } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import "./App.css";
import TopNav from "./components/ui/TopNav";
import PixelRibbon from "./components/ui/PixelRibbon";
import ScrollToTop from "./components/elements/ScrollToTop";
import AuthGuard from "./components/AuthGuard";
import Guide from "./components/elements/Guide";

// Each page in its own file, all fetched just after the first one: a later change of page waits for nothing.
const pageLoaders = [];
const page = (load) => {
  const Waiting = lazy(load);
  let Ready = null;
  pageLoaders.push(() => load().then((module) => { Ready = module.default; }));
  // Fetched is not enough for lazy(): its first render still suspends, and a page's glide can't wait for that.
  return function Page() {
    // Chosen once: switching while the page is open would remount it and lose what's typed.
    const [Chosen] = useState(() => Ready ?? Waiting);
    return <Chosen />;
  };
};
const Landing = page(() => import("./views/Landing"));
const Login = page(() => import("./views/Login"));
const Register = page(() => import("./views/Register"));
const Dashboard = page(() => import("./views/Dashboard"));
const AuthCallback = page(() => import("./views/AuthCallback"));
const LinkLastfm = page(() => import("./views/LinkLastfm"));
const PlaylistNew = page(() => import("./views/PlaylistNew"));
const Automation = page(() => import("./views/Automation"));
const Automations = page(() => import("./views/Automations"));
const Playlists = page(() => import("./views/Playlists"));
const Playlist = page(() => import("./views/Playlist"));
const Settings = page(() => import("./views/Settings"));
const LastfmReturn = page(() => import("./views/LastfmReturn"));
const Privacy = page(() => import("./views/Privacy"));

const NO_NAV_PATHS = ["/", "/privacy", "/login", "/register", "/auth/callback", "/auth/lastfm", "/link-lastfm"];

function App() {
  const location = useLocation();
  const showNav = !NO_NAV_PATHS.includes(location.pathname);

  useEffect(() => {
    // A failed fetch only costs the head start: the page retries when it is opened.
    const timer = setTimeout(() => pageLoaders.forEach((load) => load().catch(() => {})), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="app-container">
      <ScrollToTop />
      {/* Before the ribbon, so what a page puts here passes under its flame. */}
      <div id="under-ribbon" className="under-ribbon" />
      <PixelRibbon />
      {showNav && <TopNav />}
      {showNav && <Guide />}
      <div className="app-main">
        <div className="min-w-0 flex-1">
          {/* The new page is there at once: nothing waits for the old one to leave. */}
          <div key={location.pathname} className="page-enter h-full">
            <Suspense fallback={null}>
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
              <Route path="/playlists/new" element={<Navigate to="/automations/new" replace />} />
              <Route
                path="/playlists/:id"
                element={
                  <AuthGuard>
                    <Playlist />
                  </AuthGuard>
                }
              />
              <Route
                path="/automations"
                element={
                  <AuthGuard>
                    <Automations />
                  </AuthGuard>
                }
              />
              <Route
                path="/automations/new"
                element={
                  <AuthGuard>
                    <PlaylistNew />
                  </AuthGuard>
                }
              />
              <Route
                path="/automations/:id"
                element={
                  <AuthGuard>
                    <Automation />
                  </AuthGuard>
                }
              />
              <Route
                path="/automations/:id/edit"
                element={
                  <AuthGuard>
                    <PlaylistNew />
                  </AuthGuard>
                }
              />
              <Route
                path="/settings"
                element={
                  <AuthGuard>
                    <Settings />
                  </AuthGuard>
                }
              />
              <Route
                path="/auth/lastfm"
                element={
                  <AuthGuard>
                    <LastfmReturn />
                  </AuthGuard>
                }
              />
              <Route path="/privacy" element={<Privacy />} />
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
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
