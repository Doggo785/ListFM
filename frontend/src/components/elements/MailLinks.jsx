import { useState } from "react";
import { FormError, TextField } from "@/components/elements/AuthScreen";
import { Button } from "@/components/ui/button";
import { useMailLinkRequest } from "@/hooks/useMailLinkRequest";

/** Ask for a fresh confirmation link: the mail got lost, or the link is too old. */
export function ResendLink({ email: known = "" }) {
  const [email, setEmail] = useState(known);
  const { said, error, sending, send } = useMailLinkRequest("/api/auth/confirm/resend");

  const submit = (event) => {
    event.preventDefault();
    send(email);
  };

  if (said) return <p role="status" className="text-(--text-muted)">{said}</p>;
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {!known && <TextField id="resend-email" label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={sending} />}
      <FormError>{error}</FormError>
      <Button type="submit" variant="outline" disabled={sending || !email.trim()}>{sending ? "Sending" : "Send a new link"}</Button>
    </form>
  );
}
