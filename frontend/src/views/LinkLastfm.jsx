import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import AuthScreen, { FormError } from "@/components/elements/AuthScreen";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { connectLastfm, readableError } from "@/lib/api";

export default function LinkLastfm() {
  const [error, setError] = useState("");
  const [leaving, setLeaving] = useState(false);
  const { isLastfmLinked } = useAuth();

  useEffect(() => {
    document.title = "Connect Last.fm - ListFM";
  }, []);

  if (isLastfmLinked) return <Navigate to="/dashboard" replace />;

  const connect = async () => {
    setError("");
    setLeaving(true);
    try {
      await connectLastfm();
    } catch (err) {
      setError(readableError(err));
      setLeaving(false);
    }
  };

  return (
    <AuthScreen title="Connect Last.fm">
      <div className="flex flex-col gap-4">
        <p className="text-(--text-muted)">ListFM makes your playlists from your Last.fm history. Last.fm asks you to allow it, and your listens are copied once, which can take a few minutes for a long history.</p>
        <FormError>{error}</FormError>
        <Button onClick={connect} disabled={leaving}>{leaving ? "Opening Last.fm" : "Connect Last.fm"}</Button>
      </div>
    </AuthScreen>
  );
}
