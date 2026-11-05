import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthScreen, { FormError } from "@/components/elements/AuthScreen";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { useAuth } from "@/contexts/AuthContext";
import { readableError } from "@/lib/api";

/** Where Last.fm sends the browser back, with a token that works once. */
export default function LastfmReturn() {
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const { finishLastfmLink, isLastfmLinked } = useAuth();
  const navigate = useNavigate();
  const asked = useRef(false);

  useEffect(() => {
    document.title = "Connecting Last.fm - ListFM";
    if (asked.current) return;
    asked.current = true;
    finishLastfmLink(params.get("token") ?? "", params.get("state") ?? "")
      .then(({ first_link: firstLink }) => navigate(firstLink ? "/dashboard" : "/settings", { replace: true }))
      .catch((err) => setError(readableError(err)));
  }, [params, finishLastfmLink, navigate]);

  return (
    <AuthScreen title={error ? "Last.fm is not connected" : "Connecting Last.fm"}>
      {error && (
        <div className="flex flex-col gap-4">
          <FormError>{error}</FormError>
          <Link to={isLastfmLinked ? "/settings" : "/link-lastfm"} className={buttonVariants()}>Try again</Link>
        </div>
      )}
    </AuthScreen>
  );
}
