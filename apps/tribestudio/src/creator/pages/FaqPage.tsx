import { Link } from '../../router';
import { useConfig } from '../CreatorProvider';
import { WhatsAppCard } from '../components';

const FALLBACK = [
  ['Who may join?', 'Anyone with a connection to Kasem language or culture. You do not need to be a professional creator.'],
  ['Must I already be a professional creator?', 'No. Everyday voices are welcome and encouraged.'],
  ['When will submissions open?', 'We will announce the exact date. Join the waitlist and WhatsApp Channel to hear first.'],
  ['Is joining free?', 'Yes. Joining the founding creators programme is always free.'],
  ['Does every submission receive money?', 'No. Registration and submission never guarantee selection, publication or payment.'],
  ['What happens after I submit?', 'Your submission is reviewed. You may be asked for a revision before a final decision.'],
  ['Can I submit from outside Ghana?', 'Yes, unless a specific campaign sets a geographic limit.'],
  ['Can I submit content already posted on social media?', 'Often yes — you can also link an existing public post. Check each campaign’s rules.'],
  ['Can I withdraw my submission?', 'Yes, while it is still eligible to be withdrawn.'],
  ['How will winners be selected?', 'By reviewers using the published judging criteria for each campaign.'],
  ['What happens to approved content?', 'With your separate permission, it may be published in Indigen World products.'],
  ['How will I receive announcements?', 'Through in-app notifications, email (if you opted in) and the WhatsApp Channel.'],
];

export function FaqPage() {
  const { config, whatsappUrl } = useConfig();
  const faqs = config?.faqs && config.faqs.length > 0
    ? config.faqs.map((f) => [f.question, f.answer] as const)
    : FALLBACK;

  return (
    <div className="doc">
      <header className="doc__head">
        <p className="hero__eyebrow">Founding Creators</p>
        <h1>Frequently asked questions</h1>
        <p className="muted">Registration does not guarantee selection, publication or payment.</p>
      </header>
      <div className="faq">
        {faqs.map(([q, a]) => (
          <details key={q} className="faq__item">
            <summary>{q}</summary>
            <p>{a}</p>
          </details>
        ))}
      </div>
      <p className="section__more">
        Still have a question? <Link to="/studio/help">Contact support →</Link>
      </p>
      <WhatsAppCard url={whatsappUrl} />
    </div>
  );
}
