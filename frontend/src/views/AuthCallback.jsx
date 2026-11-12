import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthScreen, { FormError, TextField } from "@/components/elements/AuthScreen";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { useAuth } from "@/contexts/AuthContext";
import { readableError, request } from "@/lib/api";

/** Where a failed or unfinished Google or Discord sign-in lands. A successful one goes straight to the site. */
export default function AuthCallback() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isAuthenticated, isLastfmLinked, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const needsEmail = params.get("needs_email") === "1";
  const failure = params.get("error") ? params.get("error_description") || "The sign-in did not finish. Please try again." : "";

  useEffect(() => {
    document.title = "Signing in - ListFM";
  }, []);

  useEffect(() => {
    if (loading || needsEmail || failure) return;
    if (!isAuthenticated) navigate("/login", { replace: true });
    else navigate(isLastfmLinked ? "/dashboard" : "/link-lastfm", { replace: true });
  }, [loading, needsEmail, failure, isAuthenticated, isLastfmLinked, navigate]);

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim()) {
      setError("Enter an email address.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await request("/api/auth/oauth/complete-email", { method: "POST", body: JSON.stringify({ email: email.trim() }) });
      navigate(isLastfmLinked ? "/dashboard" : "/link-lastfm", { replace: true });
    } catch (err) {
      setError(readableError(err));
      setSaving(false);
    }
  };

  if (needsEmail) {
    return (
      <AuthScreen title="One more thing">
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className="text-(--text-muted)">Discord did not share an email address. Enter one to finish your account: we&apos;ll mail you a link to confirm it.</p>
          <TextField id="oauth-email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={saving} />
          <FormError>{error}</FormError>
          <Button type="submit" disabled={saving}>{saving ? "Saving" : "Continue"}</Button>
        </form>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title={failure ? "You are not signed in" : "Signing in"}>
      {failure && (
        <div className="flex flex-col gap-4">
          <FormError>{failure}</FormError>
          <Link to="/login" className={buttonVariants()}>Back to log in</Link>
        </div>
      )}
    </AuthScreen>
  );
}
