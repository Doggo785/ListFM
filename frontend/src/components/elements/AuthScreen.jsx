import { useState } from "react";
import { Link } from "react-router-dom";
import { useReducedMotion } from "motion/react";
import { IconEye, IconEyeOff } from "@tabler/icons-react";
import ForgedName from "@/components/dashboard/ForgedName";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DiscordIcon, GoogleIcon } from "@/components/ui/OAuthIcons";

/** Every screen before the site proper: the name on the ribbon, and one task beside it. */
export default function AuthScreen({ title, children }) {
  const reducedMotion = useReducedMotion();
  return (
    <main className="auth">
      <div className="auth__name">
        <Link to="/" aria-label="ListFM home" className="auth__home">
          <ForgedName name="ListFM" reducedMotion={reducedMotion} relights={false} />
        </Link>
      </div>
      <div className="auth__task" data-quiet>
        <h2 className="mb-6 font-heading text-4xl">{title}</h2>
        {children}
      </div>
    </main>
  );
}

export function FormField({ id, label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-(--text-muted)">{label}</label>
      {children}
    </div>
  );
}

export function TextField({ id, label, ...props }) {
  return (
    <FormField id={id} label={label}>
      <Input id={id} className="w-full" {...props} />
    </FormField>
  );
}

export function MaskedField({ id, label, ...props }) {
  const [shown, setShown] = useState(false);
  return (
    <FormField id={id} label={label}>
      <div className="relative">
        <Input id={id} type={shown ? "text" : "password"} className="w-full pr-11" {...props} />
        <button
          type="button"
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          aria-pressed={shown}
          onClick={() => setShown(!shown)}
          className="absolute top-0 right-0 flex h-full w-11 items-center justify-center text-(--text-muted) hover:text-(--text)"
        >
          {shown ? <IconEyeOff size={20} /> : <IconEye size={20} />}
        </button>
      </div>
    </FormField>
  );
}

export function FormError({ children }) {
  return children ? <p role="alert" className="text-pretty text-(--ember-7)">{children}</p> : null;
}

export function ProviderButtons({ verb, disabled }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Button type="button" variant="outline" onClick={() => { window.location.href = "/api/auth/google/login"; }} disabled={disabled}><GoogleIcon />{verb} with Google</Button>
      <Button type="button" variant="outline" onClick={() => { window.location.href = "/api/auth/discord/login"; }} disabled={disabled}><DiscordIcon />{verb} with Discord</Button>
    </div>
  );
}
