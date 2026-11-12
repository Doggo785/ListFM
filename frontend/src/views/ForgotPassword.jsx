import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AuthScreen, { FormError, TextField } from "@/components/elements/AuthScreen";
import { Button } from "@/components/ui/button";
import { useMailLinkRequest } from "@/hooks/useMailLinkRequest";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const { said, error, setError, sending, send } = useMailLinkRequest("/api/auth/password/forgot");

  useEffect(() => {
    document.title = "Forgot your password - ListFM";
  }, []);

  const submit = (event) => {
    event.preventDefault();
    if (!email.trim()) setError("Enter the email you signed up with.");
    else send(email);
  };

  return (
    <AuthScreen title="Forgot your password?">
      {said ? (
        <div className="flex flex-col gap-4">
          <p role="status" className="text-pretty">{said}</p>
          <p className="text-(--text-muted)">The link works for one hour. Nothing came? Look in your spam.</p>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="flex flex-col gap-4">
          <p className="text-(--text-muted)">We&apos;ll mail you a link to choose a new one.</p>
          <TextField id="forgot-email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sending} />
          <FormError>{error}</FormError>
          <Button type="submit" disabled={sending}>{sending ? "Sending" : "Send the link"}</Button>
        </form>
      )}
      <p className="mt-6 border-t border-(--line) pt-6 text-(--text-muted)">
        Remembered it? <Link to="/login" className="text-(--text) underline underline-offset-4">Log in</Link>
      </p>
    </AuthScreen>
  );
}
