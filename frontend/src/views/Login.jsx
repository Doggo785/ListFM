import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import AuthScreen, { FormError, MaskedField, ProviderButtons, TextField } from "@/components/elements/AuthScreen";
import { ResendLink } from "@/components/elements/MailLinks";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { readableError } from "@/lib/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // The password was right, but the address was never confirmed.
  const [unconfirmed, setUnconfirmed] = useState(false);
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Log in - ListFM";
  }, []);

  useEffect(() => {
    if (isAuthenticated) navigate("/dashboard");
  }, [isAuthenticated, navigate]);

  const submit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Enter your email and your password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err) {
      setUnconfirmed(err.message.startsWith("API 403"));
      setError(readableError(err));
      setLoading(false);
    }
  };

  return (
    <AuthScreen title="Log in">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField id="email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={loading} />
        <MaskedField id="password" label="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={loading} />
        <Link to="/forgot-password" className="w-fit text-sm text-(--text-muted) underline underline-offset-4 hover:text-(--text)">Forgot your password?</Link>
        <FormError>{error}</FormError>
        <Button type="submit" disabled={loading}>{loading ? "Logging in" : "Log in"}</Button>
      </form>
      {unconfirmed && <div className="mt-4"><ResendLink email={email.trim().toLowerCase()} /></div>}
      <div className="mt-6 flex flex-col gap-4 border-t border-(--line) pt-6">
        <ProviderButtons verb="Log in" disabled={loading} />
        <p className="text-(--text-muted)">New here? <Link to="/register" className="text-(--text) underline underline-offset-4">Create an account</Link></p>
      </div>
    </AuthScreen>
  );
}
