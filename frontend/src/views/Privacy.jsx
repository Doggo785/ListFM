import { useEffect } from "react";
import { Link } from "react-router-dom";

// What this page says must stay true of the code: change one, change the other (AGENTS.md).
const UPDATED = "November 12, 2026";
const PUBLISHER = "Stéphane Plathey";
const CONTACT = "listfm@doggolabs.fr";
const REPOSITORY = "https://github.com/Doggo785/ListFM";

const link = "text-(--text) underline underline-offset-4 hover:text-(--ember)";

function Part({ title, children }) {
  return (
    <section data-quiet className="privacy__part">
      <h2 className="pb-3 text-3xl">{title}</h2>
      <div className="flex flex-col gap-3 text-(--text-muted)">{children}</div>
    </section>
  );
}

function List({ children }) {
  return <ul className="flex list-disc flex-col gap-2 pl-6">{children}</ul>;
}

/** Plain words on what ListFM keeps, and the legal notice French law asks every site for. */
export default function Privacy() {
  useEffect(() => {
    document.title = "Privacy - ListFM";
  }, []);

  return (
    <main className="scroll-edge h-full w-full min-w-0 flex-1 overflow-y-auto px-4 pb-12 text-left md:px-8">
      <div className="privacy">
        <div data-quiet className="pt-6 pb-10">
          <Link to="/" className="font-heading text-2xl hover:text-(--ember)">ListFM</Link>
          <h1 className="pt-6 font-heading text-5xl">Privacy</h1>
          <p className="pt-4 text-xl text-(--text-muted)">
            ListFM is made and run by one person, on a server at home. It keeps what it needs to build your playlists, and nothing else.
            Its code is <a href={REPOSITORY} target="_blank" rel="noopener noreferrer" className={link}>public on GitHub</a>, so every line below can be checked.
          </p>
          <p className="pt-3 text-(--text-muted)">Last updated {UPDATED}.</p>
        </div>

        <Part title="What ListFM keeps">
          <List>
            <li>Your account: your email address, your password (only as a one-way hash, never readable), and your time zone, so automations run at your hour.</li>
            <li>If you sign in with Google or Discord: the email address and the name they send. Nothing else is asked of them.</li>
            <li>Your Last.fm username. ListFM never sees your Last.fm password, and doesn&apos;t keep the key Last.fm hands over when you link it.</li>
            <li>Your listening history, read from Last.fm, and the tags Last.fm gives your music.</li>
            <li>The automations you set up, their runs, and the playlists they make.</li>
          </List>
          <p>All of it is used for one thing: making your playlists. Keeping it is what you ask for when you create an account.</p>
        </Part>

        <Part title="What ListFM never does">
          <List>
            <li>No ads, no analytics, no tracking of any kind. Nothing about you is sold, rented or shared.</li>
            <li>No record of where or from what you sign in: neither your IP address nor your browser is kept with your session.</li>
            <li>No emails you didn&apos;t ask for. ListFM sends none at all today.</li>
          </List>
        </Part>

        <Part title="Cookies">
          <p>
            Two cookies keep you signed in: one lasts 30 minutes, the other 7 days. A third lives a few minutes while you sign in with Google or Discord, or link Last.fm,
            to check that the answer comes from the sign-in you started. They are needed for the site to work, which is why no cookie banner asks you about them.
            Your browser also remembers where you are in the newcomer&apos;s guide. That&apos;s all.
          </p>
        </Part>

        <Part title="Who else sees something">
          <List>
            <li>
              <span className="text-(--text)">Last.fm</span>: ListFM reads your history through Last.fm&apos;s public API. Album covers load straight from Last.fm&apos;s servers,
              so they see your IP address, as with any visit to Last.fm.
            </li>
            <li><span className="text-(--text)">Google or Discord</span>, only if you sign in with them: they know you used ListFM.</li>
            <li>
              <span className="text-(--text)">Cloudflare</span> carries the traffic between you and the server, so the server&apos;s home address stays hidden.
              It sees your IP address and the pages you load, and keeps its own logs under its{" "}
              <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer" className={link}>privacy policy</a>. It stores none of your ListFM data.
            </li>
            <li>
              The name you type to try ListFM on the home page goes to Last.fm to fetch that listener&apos;s history.
              ListFM holds it in memory for one hour and never writes it down.
            </li>
          </List>
          <p>Your data is stored on ListFM&apos;s own server, at home in France. The only copy elsewhere is the encrypted backup below.</p>
        </Part>

        <Part title="How long it stays">
          <List>
            <li>
              Your data stays as long as your account exists. Delete your account in Settings and everything goes at once: your listens, automations, runs,
              playlists, sign-in links, email and name. What is left is an empty line with no personal data.
            </li>
            <li>Each automation keeps its 50 latest playlists. Older ones are erased as new ones arrive.</li>
            <li>
              The server writes what it does in its logs, with your Last.fm username and the names of your automations. They roll over by size, so older lines
              disappear within days or weeks. They never hold your IP address.
            </li>
            <li>
              The database is backed up every night and the copies are kept up to five weeks, so a deleted account leaves the backups within five weeks too.
              One copy goes to Backblaze, encrypted before it leaves: they store it but cannot read it.
            </li>
          </List>
        </Part>

        <Part title="Your rights">
          <p>
            You can see, correct, take away or erase your data, and object to its use: that&apos;s the GDPR.
            Settings lets you change your time zone and erase everything yourself. For anything else, write to <a href={`mailto:${CONTACT}`} className={link}>{CONTACT}</a>; you get an answer within a month.
            If you think your data is mishandled, you can complain to the <a href="https://www.cnil.fr/en/complaints" target="_blank" rel="noopener noreferrer" className={link}>CNIL</a>, the French data protection authority.
          </p>
        </Part>

        <Part title="Changes">
          <p>Any change to this page is dated here, and its whole history is public on GitHub.</p>
        </Part>

        <Part title="Legal notice">
          <List>
            <li>Publisher and director of publication: {PUBLISHER}, a private individual, publishing ListFM without any commercial purpose.</li>
            <li>Host: the publisher, on their own server.</li>
            <li>Contact: <a href={`mailto:${CONTACT}`} className={link}>{CONTACT}</a>. Questions and bugs are welcome as <a href={`${REPOSITORY}/issues`} target="_blank" rel="noopener noreferrer" className={link}>GitHub issues</a>, but keep anything personal out of them: issues are public.</li>
            <li>ListFM isn&apos;t affiliated with Last.fm, Spotify or the other services named on this site.</li>
          </List>
        </Part>
      </div>
    </main>
  );
}
