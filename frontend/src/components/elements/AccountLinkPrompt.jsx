import { useNavigate } from "react-router-dom";

export default function AccountLinkPrompt({ message }) {
  const navigate = useNavigate();
  return (
    <div className="flex h-screen w-full items-center justify-center bg-[#121212]">
      <div className="text-center">
        <p className="text-white font-medium mb-2">No Last.fm account linked</p>
        <p className="text-neutral-500 text-sm">{message}</p>
        <button
          onClick={() => navigate("/link-lastfm")}
          className="mt-4 px-4 py-2 bg-[#ff530b] text-white text-sm rounded-lg hover:bg-[#e04d0a] transition-colors"
        >
          Link Last.fm
        </button>
      </div>
    </div>
  );
}
