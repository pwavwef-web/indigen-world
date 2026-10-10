/**
 * src/components/AudiencePaths.tsx
 *
 * The two things a visitor can do today, side by side: learn Kasem, or
 * contribute it. Each path says who it is for, exactly what it offers now,
 * and what it needs from the visitor — an account, time, money — before the
 * button, so nobody discovers a waitlist or a sign-in only after clicking.
 *
 * Everyone else (schools, researchers, partners) gets one line to Get
 * Involved rather than two more cards competing with the two paths.
 */
import { Link } from "../app/router";
import { Button } from "./Button";
import { Icon } from "./Icon";

const LEARN_TODAY = [
  "Search by Kasem, English or dialect",
  "Read meanings, examples and cultural context",
  "Listen where a pronunciation has been recorded",
  "Save words on this device for your next visit",
] as const;

const CONTRIBUTE_TODAY = [
  "One clear task: about five minutes per expression",
  "A Kasem-speaking reviewer checks it before anyone sees it",
  "Follow its status — waiting, approved, published, or the reviewer's reason",
  "Published as an expression, credited to you",
] as const;

export function AudiencePaths() {
  return (
    <>
      <div className="today-paths">
        <article className="today-path today-path--learn" aria-labelledby="path-learn">
          <p className="today-path__who">For learners and families</p>
          <h3 id="path-learn">Learn Kasem</h3>
          <p>Look words up in the public dictionary, hear them spoken where a recording exists, and keep the ones you want.</p>
          <ul>
            {LEARN_TODAY.map((item) => (
              <li key={item}>
                <Icon name="check" size={16} /> {item}
              </li>
            ))}
          </ul>
          <p className="today-path__needs">No account needed.</p>
          <div className="today-path__actions">
            <Button to="dictionary">Open the dictionary</Button>
            <Button to="learn" variant="secondary">
              Follow the learning guide
            </Button>
          </div>
        </article>

        <article className="today-path today-path--contribute" aria-labelledby="path-contribute">
          <p className="today-path__who">For Kasem speakers</p>
          <h3 id="path-contribute">Contribute Kasem</h3>
          <p>
            Share one everyday expression — a greeting, a blessing, an idiom or a saying — with what it means, when it
            is said and who you learned it from.
          </p>
          <ul>
            {CONTRIBUTE_TODAY.map((item) => (
              <li key={item}>
                <Icon name="check" size={16} /> {item}
              </li>
            ))}
          </ul>
          <p className="today-path__needs">Free Google sign-in, so you can follow the review. Volunteer — no payment.</p>
          <p className="today-path__more">
            In{" "}
            <a href="https://tribestudio.indigenworld.com/" target="_blank" rel="noreferrer">
              TribeStudio
            </a>{" "}
            you can also add single words to the dictionary, or share stories, recordings and videos.
          </p>
          <div className="today-path__actions">
            <Button to="contribute">Share an expression</Button>
          </div>
        </article>
      </div>
      <p className="today-others">
        Teaching, researching or supporting the work? <Link to="get-involved">Tell us how you would like to be involved</Link>.
      </p>
    </>
  );
}
