import { useConfig } from '../CreatorProvider';
import { Skeleton, WhatsAppCard } from '../components';

// Fallback sections used only until CMS-style guidelines are configured in the
// admin portal. The authoritative content comes from platformConfiguration.
const FALLBACK = [
  ['Eligible content', 'Original Kasem-language storytelling, comedy, education, music, poetry, culture and everyday life.'],
  ['Language expectations', 'Content should be primarily in Kasem. Provide an English translation or summary where you can.'],
  ['Originality requirements', 'Your content must be your own work, or used with documented permission.'],
  ['Copyright and music', 'Do not use copyrighted music, images or footage without the right to do so.'],
  ['Recording quality', 'Record in a quiet, well-lit place. Hold the camera steady and keep audio clear.'],
  ['Cultural sensitivity', 'Respect sacred, restricted or sensitive material. When unsure, ask before sharing.'],
  ['Featuring other people', 'Get consent from anyone who appears in your content.'],
  ['Content involving minors', 'A guardian must consent before a minor appears in a submission.'],
  ['Translations and captions', 'Captions and translations help more people enjoy and learn from your work.'],
  ['Judging criteria', 'Entries are judged on language quality, creativity, cultural value, originality and technical quality.'],
  ['Review and revision', 'Reviewers may request revisions before a decision is final.'],
  ['Publication rules', 'Approved content may be featured in Indigen World products with your permission.'],
  ['Rewards and payment eligibility', 'Registration never guarantees payment. Payout eligibility is confirmed per campaign.'],
  ['Removal and corrections', 'You may request corrections or removal of your published content.'],
  ['Separate content-use permissions', 'Publication, promotion and AI-training permissions are always requested separately per submission.'],
  ['Contact and support', 'Reach us from the Help section of your workspace.'],
];

export function GuidelinesPage() {
  const { config, loading, whatsappUrl } = useConfig();
  const sections = config?.guidelines && config.guidelines.length > 0
    ? config.guidelines.map((g) => [g.heading, g.body] as const)
    : FALLBACK;

  return (
    <div className="doc">
      <header className="doc__head">
        <p className="hero__eyebrow">Founding Creators</p>
        <h1>Creator guidelines</h1>
        <p className="muted">How to create, submit and share content that celebrates Kasem language and culture.</p>
      </header>
      {loading ? (
        <Skeleton lines={8} />
      ) : (
        <div className="doc__sections">
          {sections.map(([heading, body]) => (
            <section key={heading} className="doc__section">
              <h2>{heading}</h2>
              <p>{body}</p>
            </section>
          ))}
        </div>
      )}
      <WhatsAppCard url={whatsappUrl} />
    </div>
  );
}
