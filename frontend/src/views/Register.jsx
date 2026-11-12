import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AuthScreen, { FormError, MaskedField, ProviderButtons, TextField } from "@/components/elements/AuthScreen";
import { ResendLink } from "@/components/elements/MailLinks";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { readableError } from "@/lib/api";
import { MIN_PASSWORD } from "@/lib/password";

function problem(email, first, again) {
  if (!/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)) return "Enter a valid email address.";
  if (first.length < MIN_PASSWORD) return `Your password needs at least ${MIN_PASSWORD} characters.`;
  if (first !== again) return "The two passwords are different.";
  return "";
}

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState(null);
  const { register } = useAuth();

  useEffect(() => {
    document.title = "Create an account - ListFM";
  }, []);

  const submit = async (event) => {
    event.preventDefault();
    const found = problem(email.trim(), password, confirm);
    setError(found);
    if (found) return;
    setLoading(true);
    try {
      await register(email.trim(), password);
      setSentTo(email.trim().toLowerCase());
    } catch (err) {
      setError(readableError(err));
    }
    setLoading(false);
  };

  if (sentTo) {
    return (
      <AuthScreen title="Check your inbox">
        <div className="flex flex-col gap-4">
          <p className="text-pretty">
            We sent a link to <span className="text-(--ember)">{sentTo}</span>. Open it to finish creating your account: it works for 24 hours.
          </p>
          <p className="text-(--text-muted)">Nothing yet? Look in your spam, or ask for a new one.</p>
          <ResendLink email={sentTo} />
          <p className="text-(--text-muted)">
            Wrong address?{" "}
            <button type="button" onClick={() => setSentTo(null)} className="text-(--text) underline underline-offset-4">Start again</button>
          </p>
        </div>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen title="Create an account">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField id="register-email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
        <MaskedField id="register-password" label="Password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
        <MaskedField id="register-confirm" label="Password again" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={loading} />
        <FormError>{error}</FormError>
        <Button type="submit" disabled={loading}>{loading ? "Creating your account" : "Create account"}</Button>
      </form>
      <div className="mt-6 flex flex-col gap-4 border-t border-(--line) pt-6">
        <ProviderButtons verb="Sign up" disabled={loading} />
        <p className="text-(--text-muted)">Already have an account? <Link to="/login" className="text-(--text) underline underline-offset-4">Log in</Link></p>
        <p className="text-(--text-muted)">What ListFM keeps, and never does: <Link to="/privacy" className="text-(--text) underline underline-offset-4">Privacy</Link></p>
      </div>
    </AuthScreen>
  );
}
