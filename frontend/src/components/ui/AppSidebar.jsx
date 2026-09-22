import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  IconHome,
  IconChartBar,
  IconUser,
  IconPlaylist,
  IconLogout,
} from "@tabler/icons-react";
import { Sidebar, SidebarBody, SidebarLink } from "./Sidebar";
import { getUserInfo } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const iconClass = "text-neutral-200 h-5 w-5 flex-shrink-0";

function AppSidebar({ userLabel = "User" }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const [avatar, setAvatar] = useState(null);
  const { user, logout } = useAuth();
  const username = user?.lastfm_username;

  useEffect(() => {
    if (!username) return;
    getUserInfo()
      .then((data) => setAvatar(data?.image || null))
      .catch(() => setAvatar(null));
  }, [username]);

  const isActive = (href) =>
    typeof href === "string" && href.startsWith("/") &&
    location.pathname.startsWith(href);

  const linkClass = (href) =>
    isActive(href) ? "text-white font-medium" : undefined;

  const links = [
    {
      label: "Home",
      href: "/dashboard",
      icon: <IconHome className={iconClass} />,
      className: linkClass("/dashboard"),
    },
    {
      label: "Playlists",
      href: "/playlists",
      icon: <IconPlaylist className={iconClass} />,
      className: linkClass("/playlists"),
    },
    {
      label: "Stats",
      href: null,
      icon: <IconChartBar className={iconClass} />,
      className: undefined,
    },
    {
      label: "Profile",
      href: null,
      icon: <IconUser className={iconClass} />,
      className: undefined,
    },
  ];

  return (
    <Sidebar open={open} setOpen={setOpen} animate={true}>
      <SidebarBody className="justify-between gap-10 border-r border-neutral-800 bg-[#1c1c1c]">
        <div className="flex flex-col flex-1 overflow-y-auto overflow-x-hidden">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="mt-4 mb-8 px-4 text-left"
          >
            <h1 className="text-2xl font-black text-[#ff530b]">ListFM</h1>
          </button>
          <div className="flex flex-col gap-2">
            {links.map(({ className, ...link }) => (
              <SidebarLink key={link.label} link={link} className={className} />
            ))}
          </div>
        </div>
        <div className="px-4 py-4 border-t border-neutral-800">
          <div className="flex items-center gap-2">
            {avatar ? (
              <img
                src={avatar}
                alt={username || userLabel}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="h-8 w-8 rounded-full bg-[#ff530b] flex items-center justify-center text-white font-bold text-xs">
                {(username || userLabel).charAt(0).toUpperCase()}
              </div>
            )}
            {open && (
              <span className="text-white text-sm font-medium truncate">
                {username || userLabel}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => { logout(); navigate("/"); }}
            className="mt-3 flex items-center gap-2 text-neutral-400 hover:text-red-400 transition-colors text-sm"
          >
            <IconLogout size={16} />
            {open && <span>Log out</span>}
          </button>
        </div>
      </SidebarBody>
    </Sidebar>
  );
}

export default AppSidebar;
