import { useState } from "react";
import { FormError, TextField } from "@/components/elements/AuthScreen";
import { Button } from "@/components/ui/button";
import { readableError, request } from "@/lib/api";

/** Ask for a fresh confirmation link: the mail got lost, or the link is too old. */
export function ResendLink({ email: known = "" }) {
  const [email, setEmail] = useState(known);
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const send = async (event) => {
    event.preventDefault();
    setError("");
    setSending(true);
    try {
      setSaid((await request("/api/auth/confirm/resend", { method: "POST", body: JSON.stringify({ email: email.trim() }) })).detail);
    } catch (err) {
      setError(readableError(err));
    }
    setSending(false);
  };

  if (said) return <p role="status" className="text-(--text-muted)">{said}</p>;
  return (
    <form onSubmit={send} noValidate className="flex flex-col gap-4">
      {!known && <TextField id="resend-email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sending} />}
      <FormError>{error}</FormError>
      <Button type="submit" variant="outline" disabled={sending || !email.trim()}>{sending ? "Sending" : "Send a new link"}</Button>
    </form>
  );
}
