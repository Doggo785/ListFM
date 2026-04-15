import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconHome,
  IconChartBar,
  IconUser,
  IconPlaylist,
} from "@tabler/icons-react";
import { Sidebar, SidebarBody, SidebarLink } from "./Sidebar";

function AppSidebar({ username, userLabel = "User", activePage = "home" }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const links = [
    {
      label: "Home",
      href: "/",
      icon: <IconHome className="text-neutral-200 h-5 w-5 flex-shrink-0" />,
    },
    {
      label: "Playlists",
      href: "/playlists",
      icon: <IconPlaylist className="text-neutral-200 h-5 w-5 flex-shrink-0" />,
    },
    {
      label: "Stats",
      href:
        activePage === "dashboard" && username ? `/dashboard/${username}` : "#",
      icon: <IconChartBar className="text-neutral-200 h-5 w-5 flex-shrink-0" />,
    },
    {
      label: "Profile",
      href: "#",
      icon: <IconUser className="text-neutral-200 h-5 w-5 flex-shrink-0" />,
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
            {links.map((link) => (
              <SidebarLink key={link.label} link={link} />
            ))}
          </div>
        </div>
        <div className="px-4 py-4 border-t border-neutral-800">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-full bg-[#ff530b] flex items-center justify-center text-white font-bold text-xs">
              {(username || userLabel).charAt(0).toUpperCase()}
            </div>
            {open && (
              <span className="text-white text-sm font-medium truncate">
                {username || userLabel}
              </span>
            )}
          </div>
        </div>
      </SidebarBody>
    </Sidebar>
  );
}

export default AppSidebar;
