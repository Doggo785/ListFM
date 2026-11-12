import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AuthScreen from "@/components/elements/AuthScreen";
import Loader from "@/components/elements/Loader";
import { ResendLink } from "@/components/elements/MailLinks";
import { useAuth } from "@/contexts/AuthContext";
import { readableError } from "@/lib/api";

const GONE = "This link no longer works. Ask for a new one.";

/** Where the confirmation mail leads: the address is confirmed, the person signed in, and Last.fm comes next. */
export default function ConfirmEmail() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [failed, setFailed] = useState(token ? "" : GONE);
  const { confirmEmail } = useAuth();
  const navigate = useNavigate();
  // A link works once: React's second effect run in development must not spend it again.
  const sent = useRef(false);

  useEffect(() => {
    document.title = "Confirm your email - ListFM";
  }, []);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    confirmEmail(token)
      .then(() => navigate("/link-lastfm", { replace: true }))
      .catch((err) => setFailed(readableError(err)));
  }, [token, confirmEmail, navigate]);

  if (!failed) {
    return (
      <AuthScreen title="Confirming your email">
        <Loader />
      </AuthScreen>
    );
  }
  return (
    <AuthScreen title="This link no longer works">
      <div className="flex flex-col gap-4">
        <p role="alert" className="text-pretty text-(--text-muted)">{failed}</p>
        <ResendLink />
      </div>
    </AuthScreen>
  );
}
