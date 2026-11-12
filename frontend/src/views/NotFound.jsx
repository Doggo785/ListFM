import { useEffect } from "react";
import { Link } from "react-router-dom";
import { StatePage } from "@/components/elements/PageStates";
import { buttonVariants } from "@/components/ui/buttonVariants";
import { useAuth } from "@/contexts/AuthContext";

/** Any address the site doesn't know: say so, and offer the way back. */
export default function NotFound() {
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    document.title = "Page not found - ListFM";
  }, []);

  return (
    <StatePage>
      <div data-quiet className="max-w-2xl pt-12">
        <h1 className="pb-4 font-heading text-5xl">Page not found</h1>
        <p className="pb-8 text-xl text-(--text-muted)">Nothing lives at this address. It may be mistyped, or the page has moved.</p>
        <Link to={isAuthenticated ? "/dashboard" : "/"} className={buttonVariants({ variant: "outline" })}>
          {isAuthenticated ? "Back to your dashboard" : "Back to the home page"}
        </Link>
      </div>
    </StatePage>
  );
}
