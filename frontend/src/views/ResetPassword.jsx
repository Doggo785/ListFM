import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import AuthScreen, { FormError, MaskedField } from "@/components/elements/AuthScreen";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { readableError } from "@/lib/api";
import { MIN_PASSWORD } from "@/lib/password";

/** Where the reset mail leads: a new password, every other device signed out, this one signed in. */
export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState(token ? "" : "This link no longer works. Ask for a new one.");
  const [saving, setSaving] = useState(false);
  const { resetPassword } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Choose a new password - ListFM";
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    if (password.length < MIN_PASSWORD) return setError(`Your password needs at least ${MIN_PASSWORD} characters.`);
    if (password !== again) return setError("The two passwords are different.");
    setError("");
    setSaving(true);
    try {
      await resetPassword(token, password);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(readableError(err));
      setSaving(false);
    }
  };

  return (
    <AuthScreen title="Choose a new password">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <MaskedField id="reset-password" label="New password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={saving || !token} />
        <MaskedField id="reset-again" label="New password again" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} disabled={saving || !token} />
        <FormError>{error}</FormError>
        <Button type="submit" disabled={saving || !token}>{saving ? "Saving" : "Save and log in"}</Button>
      </form>
      <p className="mt-6 border-t border-(--line) pt-6 text-(--text-muted)">
        Link too old? <Link to="/forgot-password" className="text-(--text) underline underline-offset-4">Ask for a new one</Link>
      </p>
    </AuthScreen>
  );
}
