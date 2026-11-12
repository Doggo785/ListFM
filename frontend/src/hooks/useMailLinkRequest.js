import { useState } from "react";
import { readableError, request } from "@/lib/api";

/** Ask the server to mail a link (a new confirmation, a password reset). Its answer reads the same whoever asks. */
export function useMailLinkRequest(path) {
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  const send = async (email) => {
    setError("");
    setSending(true);
    try {
      setSaid((await request(path, { method: "POST", body: JSON.stringify({ email: email.trim() }) })).detail);
    } catch (err) {
      setError(readableError(err));
    }
    setSending(false);
  };

  return { said, error, setError, sending, send };
}
