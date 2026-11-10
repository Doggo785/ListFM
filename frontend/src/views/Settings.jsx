import { useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FormError, MaskedField, TextField } from "@/components/elements/AuthScreen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Modal from "@/components/ui/Modal";
import { useAuth } from "@/contexts/AuthContext";
import { connectLastfm, readableError, request } from "@/lib/api";
import { guide } from "@/lib/guide";

const MIN_PASSWORD = 8;
const MAX_ZONES = 8;
const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

function Row({ title, note, children }) {
  return (
    <section data-quiet className="settings__row">
      <div>
        <h2 className="text-2xl">{title}</h2>
        {note && <p className="mt-1 text-(--text-muted)">{note}</p>}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-3">{children}</div>
    </section>
  );
}

function zoneOffset(zone) {
  const parts = new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "shortOffset" }).formatToParts();
  return parts.find((part) => part.type === "timeZoneName")?.value ?? "";
}
const zoneLabel = (zone) => zone.replaceAll("_", " ");

/** Search, not a list of 400 zones: nobody reads it, and the browser has already chosen for most people. */
function TimezonePicker({ zone, onPick }) {
  const [query, setQuery] = useState(null); // null while closed: the box then shows the zone in use.
  const [active, setActive] = useState(-1);
  const listId = useId();
  const open = query !== null;
  const wanted = (query ?? "").trim().toLowerCase();

  const matches = useMemo(() => {
    if (!open) return [];
    const device = browserZone();
    if (!wanted) return [...new Set([device, zone])];
    const all = new Set([device, zone, "UTC", ...Intl.supportedValuesOf("timeZone")]);
    return [...all].filter((value) => zoneLabel(value).toLowerCase().includes(wanted)).slice(0, MAX_ZONES);
  }, [open, wanted, zone]);

  const close = () => {
    setQuery(null);
    setActive(-1);
  };
  const reopen = () => setQuery((current) => current ?? "");
  const pick = (value) => {
    close();
    if (value !== zone) onPick(value);
  };
  const onKeyDown = (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      reopen();
      if (matches.length > 0) setActive((i) => (e.key === "ArrowDown" ? (i + 1) % matches.length : i <= 0 ? matches.length - 1 : i - 1));
    } else if (e.key === "Enter" && matches.length > 0) {
      pick(matches[Math.max(active, 0)]);
    } else if (e.key === "Escape") {
      close();
    }
  };

  return (
    <div className="relative w-full max-w-80">
      <Input
        type="text"
        role="combobox"
        aria-label="Time zone"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={query ?? zoneLabel(zone)}
        placeholder="Type a city or a region"
        onFocus={reopen}
        onClick={reopen}
        onBlur={close}
        onChange={(e) => {
          // Still focused after a pick: what is typed next starts a search, it doesn't extend the zone's name.
          setQuery(open ? e.target.value : e.target.value.replace(zoneLabel(zone), ""));
          setActive(-1);
        }}
        onKeyDown={onKeyDown}
        className="w-full"
      />
      {open && (
        // Pressing the list must not blur the box, or the list would close before the click lands.
        <ul id={listId} role="listbox" aria-label="Time zones" onMouseDown={(e) => e.preventDefault()} className="absolute z-50 mt-1 w-full border-2 border-(--ember) bg-(--ground)">
          {matches.map((value, i) => (
            <li
              key={value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={value === zone}
              onClick={() => pick(value)}
              className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm hover:bg-(--ember-1) ${i === active ? "bg-(--ember-1)" : ""} ${value === zone ? "text-(--ember)" : ""}`}
            >
              <span className="flex-1 truncate">{zoneLabel(value)}</span>
              <span className="shrink-0 text-(--text-muted)">{zoneOffset(value)}</span>
            </li>
          ))}
          {matches.length === 0 && <li className="px-3 py-2 text-sm text-(--text-muted)">No match. Try the largest city near you.</li>}
        </ul>
      )}
    </div>
  );
}

function TimezoneRow({ stored, onSaved }) {
  const [zone, setZone] = useState(stored ?? browserZone());
  const [status, setStatus] = useState("");

  const pick = async (next) => {
    const before = zone;
    setZone(next);
    setStatus("");
    try {
      await request("/api/auth/me/timezone", { method: "PUT", body: JSON.stringify({ timezone: next }) });
      setStatus("Saved");
      onSaved();
    } catch (err) {
      setZone(before);
      setStatus(readableError(err));
    }
  };

  return (
    <Row title="Time zone" note="Your schedules and listening moments are read in this zone.">
      <TimezonePicker zone={zone} onPick={pick} />
      <p role="status" className="min-h-6 text-(--text-muted)">{status}</p>
    </Row>
  );
}

function LastfmRow({ username }) {
  const [warning, setWarning] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState("");

  const connect = async () => {
    setError("");
    setLeaving(true);
    try {
      await connectLastfm();
    } catch (err) {
      setWarning(false);
      setLeaving(false);
      setError(readableError(err));
    }
  };

  return (
    <Row title="Last.fm account" note={username ? null : "ListFM needs it to make your playlists."}>
      {username && <p className="text-lg">{username}</p>}
      <FormError>{error}</FormError>
      {username
        ? <Button variant="outline" onClick={() => setWarning(true)}>Change account</Button>
        : <Button onClick={connect} disabled={leaving}>Connect Last.fm</Button>}
      <Modal
        open={warning}
        onClose={() => setWarning(false)}
        title="Change your Last.fm account?"
        description="Connecting another account erases the listens copied from this one and moves your automations to the new one. Its history is then copied, which can take a few minutes. If you come back with the same account, nothing changes."
      >
        <Button variant="outline" size="sm" onClick={() => setWarning(false)}>Cancel</Button>
        <Button size="sm" onClick={connect} disabled={leaving}>{leaving ? "Opening Last.fm" : "Continue to Last.fm"}</Button>
      </Modal>
    </Row>
  );
}

function PasswordRow() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setDone(false);
    if (next.length < MIN_PASSWORD) return setError(`Your new password needs at least ${MIN_PASSWORD} characters.`);
    if (next !== again) return setError("The two new passwords are different.");
    setError("");
    setSaving(true);
    try {
      await request("/api/auth/me/password", { method: "PUT", body: JSON.stringify({ current_password: current, password: next }) });
      setCurrent("");
      setNext("");
      setAgain("");
      setDone(true);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setSaving(false);
    }
    return undefined;
  };

  return (
    <Row title="Password" note="Changing it logs you out on all your other devices. This one stays logged in.">
      <form onSubmit={submit} noValidate className="flex w-full max-w-80 flex-col gap-4">
        <MaskedField id="current-password" label="Current password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} disabled={saving} />
        <MaskedField id="new-password" label="New password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} disabled={saving} />
        <MaskedField id="new-password-again" label="New password again" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} disabled={saving} />
        <FormError>{error}</FormError>
        {done && <p role="status" className="text-(--text-muted)">Password changed. Your other devices are logged out.</p>}
        <Button type="submit" variant="outline" className="self-start" disabled={saving}>{saving ? "Changing" : "Change password"}</Button>
      </form>
    </Row>
  );
}

function DeleteRow({ email, onDeleted }) {
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const expected = email ?? "delete";
  const close = () => {
    setAsking(false);
    setTyped("");
    setError("");
  };

  const remove = async (event) => {
    event.preventDefault();
    setDeleting(true);
    setError("");
    try {
      await request("/api/auth/me/delete", { method: "POST", body: JSON.stringify({ confirm: typed }) });
      onDeleted();
    } catch (err) {
      setError(readableError(err));
      setDeleting(false);
    }
  };

  return (
    <Row title="Delete account" note="Everything goes at once: your listens, automations and playlists. This cannot be undone.">
      <Button variant="danger" onClick={() => setAsking(true)}>Delete account</Button>
      <Modal
        open={asking}
        onClose={close}
        title="Delete your account?"
        description={`Type ${expected} to confirm.`}
        body={(
          <form id="delete-account" onSubmit={remove} noValidate className="mb-6 flex flex-col gap-4">
            <TextField id="delete-confirm" label="Confirmation" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} disabled={deleting} />
            <FormError>{error}</FormError>
          </form>
        )}
      >
        <Button variant="outline" size="sm" onClick={close}>Cancel</Button>
        <Button type="submit" form="delete-account" variant="danger" size="sm" disabled={deleting || typed.trim().toLowerCase() !== expected.toLowerCase()}>
          {deleting ? "Deleting" : "Delete account"}
        </Button>
      </Modal>
    </Row>
  );
}

export default function Settings() {
  const { user, refreshUser, forgetUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Settings - ListFM";
  }, []);

  return (
    <main className="scroll-edge h-full w-full min-w-0 flex-1 overflow-y-auto px-4 pb-8 text-left md:px-8">
      <div className="settings">
        <h1 data-quiet className="pt-4 pb-8 font-heading text-5xl">Settings</h1>
        <TimezoneRow stored={user.timezone} onSaved={refreshUser} />
        <LastfmRow username={user.lastfm_username} />
        {user.has_password && <PasswordRow />}
        <Row title="Guide" note="Walk through ListFM again, from your flame to a new automation.">
          <Button
            variant="outline"
            onClick={() => {
              guide.start();
              navigate("/dashboard");
            }}
          >
            Replay the guide
          </Button>
        </Row>
        <Row title="Your data" note="What ListFM keeps, and what it never does.">
          <Link to="/privacy" className="text-(--text) underline underline-offset-4 hover:text-(--ember)">Read the privacy page</Link>
        </Row>
        <DeleteRow
          email={user.email}
          onDeleted={() => {
            forgetUser();
            navigate("/", { replace: true });
          }}
        />
      </div>
    </main>
  );
}
