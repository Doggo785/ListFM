import { useLayoutEffect, useRef } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import BackgroundTasks from "@/components/elements/BackgroundTasks";

const LINKS = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Automations", to: "/automations" },
  { label: "Playlists", to: "/playlists" },
];

/** The site's navigation: the marker slides to the current page as soon as it changes. */
export default function TopNav() {
  const { user, logout, avatar } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const nav = useRef(null);
  const marker = useRef(null);
  const username = user?.lastfm_username;

  useLayoutEffect(() => {
    const current = nav.current.querySelector('[aria-current="page"]');
    marker.current.style.opacity = current ? "1" : "0";
    if (!current) return;
    marker.current.style.width = `${current.offsetWidth}px`;
    marker.current.style.transform = `translateX(${current.offsetLeft}px)`;
  }, [pathname]);

  return (
    <header className="top-nav">
      <div className="top-nav__main" data-quiet>
        <Link to="/dashboard" className="top-nav__logo">ListFM</Link>
        <nav ref={nav} className="top-nav__links" aria-label="Main">
          {LINKS.map(({ label, to }) => (
            <NavLink key={to} to={to}>{label}</NavLink>
          ))}
          <span ref={marker} className="top-nav__marker" aria-hidden="true" />
        </nav>
      </div>
      <BackgroundTasks />
      <div className="top-nav__account" data-quiet>
        {avatar && <img src={avatar} alt="" className="top-nav__avatar" />}
        {username && <span>{username}</span>}
        <button type="button" onClick={() => { logout(); navigate("/"); }}>Log out</button>
      </div>
    </header>
  );
}
