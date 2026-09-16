import { useEffect, useState } from "react";
import { Button } from "./Button";
import { SectionHeading } from "./SectionHeading";

const BLOG = "https://updates.indigenworld.com/";
type Entry = { title?: { $t?: string }; summary?: { $t?: string }; published?: { $t?: string }; link?: { rel: string; href: string }[]; "media$thumbnail"?: { url: string } };
type Feed = { feed?: { entry?: Entry[] } };

export function LatestUpdates() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [status, setStatus] = useState("loading");
  useEffect(() => {
    // Blogger supports public cross-origin feeds through its JSONP endpoint.
    const callback = `iwBlog_${crypto.randomUUID().replaceAll("-", "")}`;
    const callbacks = window as unknown as Record<string, unknown>;
    const script = document.createElement("script");
    let active = true;
    const finish = () => { window.clearTimeout(timeout); script.remove(); };
    const fail = () => { if (active) setStatus("error"); finish(); };
    const timeout = window.setTimeout(fail, 10000);
    callbacks[callback] = (data: Feed) => {
      if (!active) return;
      try {
        setEntries((data.feed?.entry ?? []).filter(entry => entry.title?.$t && entry.link?.some(link => link.rel === "alternate" && link.href.startsWith(BLOG))).slice(0, 3));
        setStatus("ready");
      } catch { setStatus("error"); }
      finish();
    };
    script.src = `${BLOG}feeds/posts/summary?alt=json-in-script&max-results=3&orderby=published&callback=${callback}`;
    script.async = true;
    script.onerror = fail;
    document.head.append(script);
    return () => { active = false; finish(); delete callbacks[callback]; };
  }, []);
  return <section className="section section--white" id="updates">
    <div className="container">
      <SectionHeading eyebrow="From the blog" title="The latest from Indigen World." body="New releases, stories and notes from across the project. Catch up here, then visit our blog for the full story." />
      <div aria-live="polite" aria-busy={status === "loading"}>
        {status === "loading" && <p className="updates-message">Loading the latest updates…</p>}
        {status === "error" && <p className="updates-message">We couldn't load the latest updates. You can still read them on the blog.</p>}
        {status === "ready" && !entries.length && <p className="updates-message">New stories will appear here when they are published on the blog.</p>}
        {!!entries.length && <div className="updates-grid">{entries.map(entry => {
          const url = entry.link!.find(link => link.rel === "alternate" && link.href.startsWith(BLOG))!.href;
          const summary = (entry.summary?.$t ?? "").replace(/\s+/g, " ").trim();
          const date = entry.published?.$t ?? "";
          const thumbnail = entry["media$thumbnail"]?.url;
          const image = thumbnail?.startsWith("https://") ? thumbnail.replace(/\/s72-c\//, "/w640-h360-p-k-no-nu/") : undefined;
          return <article className="update-card" key={url}>
            <div className="update-card__image" aria-hidden="true">{image ? <img src={image} alt="" loading="lazy" onError={event => { event.currentTarget.style.display = "none"; }} /> : <span>Indigen World Updates</span>}</div>
            <div className="update-card__body">
              {Number.isFinite(Date.parse(date)) && <time dateTime={date}>{new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}</time>}
              <h3><a href={url}>{entry.title!.$t}</a></h3>
              <p>{summary.length > 180 ? `${summary.slice(0, 180).replace(/\s+\S*$/, "")}…` : summary}</p>
              <a className="update-card__more" href={url} aria-label={`Read on the blog: ${entry.title!.$t}`}>Read on the blog <span aria-hidden="true">↗</span></a>
            </div>
          </article>;
        })}</div>}
      </div>
      <Button href={BLOG} variant="secondary">View all blog updates</Button>
    </div>
  </section>;
}
