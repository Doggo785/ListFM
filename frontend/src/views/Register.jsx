import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthScreen, { FormError, MaskedField, ProviderButtons, TextField } from "@/components/elements/AuthScreen";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { readableError } from "@/lib/api";

const MIN_PASSWORD = 8;

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
  const { register } = useAuth();
  const navigate = useNavigate();

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
      navigate("/link-lastfm");
    } catch (err) {
      setError(readableError(err));
      setLoading(false);
    }
  };

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
      </div>
    </AuthScreen>
  );
}
