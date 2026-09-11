import { SectionHeading } from "../components/SectionHeading";
import { TesterRewardClaimForm } from "../features/forms/TesterRewardClaimForm";
import { useDocumentMeta } from "../lib/useDocumentMeta";

const PERKS = [
  "A personalised digital certificate",
  "A numbered Indigen World Founding Tester card",
  "Three months of complimentary membership when memberships launch",
  "Early access to selected future features",
  "Priority invitations to future testing programmes",
  "Optional recognition on our Founding Testers page",
];

export function TesterRewardClaimPage() {
  useDocumentMeta(
    "Founding Tester reward claim",
    "Submit the details needed to prepare your Indigen World Founding Tester recognition.",
    { noindex: true }
  );

  return (
    <>
      <section className="page-hero page-hero--tester-claim">
        <div className="container">
          <SectionHeading eyebrow="Indigen World testing programme" title="Claim your Founding Tester recognition." body="Thank you for giving your time, care and honest feedback during this testing cycle. Use this private-distribution form to tell us how your recognition should appear." light as="h1" />
        </div>
      </section>
      <section className="section section--white">
        <div className="container tester-claim-layout">
          <aside className="tester-claim-summary" aria-labelledby="tester-perks-title">
            <p className="eyebrow">What successful testers receive</p>
            <h2 id="tester-perks-title">Thank you for helping build from the beginning.</h2>
            <ul>{PERKS.map((perk) => <li key={perk}>{perk}</li>)}</ul>
            <div className="tester-claim-highlight">
              <strong>Five outstanding testers</strong>
              <p>Especially useful bug reports, usability feedback or cultural insights may also be recognised with one year of membership, a Founding Contributor badge, merchandise when available, an optional profile spotlight and priority consideration for contributor opportunities.</p>
            </div>
            <p className="tester-claim-fairness">Rewards are never based on giving the app a positive rating. Quality matters more than quantity.</p>
          </aside>
          <div className="tester-claim-form-wrap">
            <p className="eyebrow">Your details</p>
            <h2>Prepare your certificate and tester card</h2>
            <p>Complete this after you have submitted the official feedback form. Submitting here does not replace that feedback.</p>
            <TesterRewardClaimForm />
          </div>
        </div>
      </section>
    </>
  );
}
