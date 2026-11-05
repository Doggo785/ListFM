import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { FOCUS } from "@/lib/utils";

/** The whole page when there is nothing else to show. */
export function StatePage({ children }) {
  return (
    <main className="h-full w-full px-4 pt-4 text-left md:px-8">
      <div className="mx-auto max-w-6xl">{children}</div>
    </main>
  );
}

export function LinkLastfmHint({ purpose }) {
  return (
    <p data-quiet className="text-base text-(--text-muted)">
      <Link to="/link-lastfm" className={`text-(--ember) underline underline-offset-4 ${FOCUS}`}>Link your Last.fm account</Link> {purpose}
    </p>
  );
}

export function LoadFailed({ subject, onRetry }) {
  return (
    <div data-quiet role="alert">
      <p className="pb-3 text-base">{subject} could not load.</p>
      <Button variant="outline" onClick={() => onRetry()}>Try again</Button>
    </div>
  );
}

export function Gone({ subject, to, back }) {
  return (
    <div data-quiet>
      <p className="pb-4 text-2xl">{subject} no longer exists</p>
      <Link to={to} className={buttonVariants({ variant: "outline" })}>{back}</Link>
    </div>
  );
}
