/**
 * src/pages/AdsPaymentCompletePage.tsx
 *
 * Where Paystack sends somebody after they finish paying for an advert.
 *
 * Deliberately does almost nothing. This page cannot and must not decide
 * whether a payment succeeded: the query string is whatever the browser was
 * handed, and a page that read `?status=success` and said "paid" would be a
 * page anybody could forge by typing a URL. The campaign is settled by the
 * `paystackWebhook` function and by the app's own `confirmAdPayment` call,
 * both of which verify the reference against Paystack directly.
 *
 * So what is left is the one useful thing: tell the person the checkout is
 * finished, show them the reference to quote if they ever need to, and send
 * them back to the app.
 */
import { useEffect, useState } from "react";
import { Button } from "@indigen-world/web-ui";
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { ROUTES_BY_PATH } from "../content/navigation";
import { SectionHeading } from "../components/SectionHeading";
import { Link } from "../app/router";

const route = ROUTES_BY_PATH["ads/payment-complete"];

/**
 * Paystack appends `reference` on a redirect and `trxref` on some flows; they
 * carry the same value. Read for display only.
 */
function referenceFromLocation(): string | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const reference = params.get("reference") ?? params.get("trxref");
  // Guarded rather than trusted: this string is rendered, and a reference is
  // only ever the id our own backend generated.
  return reference && /^[A-Za-z0-9_-]{1,80}$/.test(reference) ? reference : null;
}

export function AdsPaymentCompletePage() {
  useDocumentMeta(route.title, route.description, { noindex: route.noindex });

  const [reference, setReference] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setReference(referenceFromLocation());
  }, []);

  const copyReference = async () => {
    if (!reference) return;
    try {
      await navigator.clipboard.writeText(reference);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard permission is not something to interrupt anybody over — the
      // reference is on the page and can be read off it.
    }
  };

  return (
    <>
      <section className="page-hero page-hero--legal">
        <div className="container">
          <SectionHeading
            eyebrow="Adverts"
            title="Checkout finished"
            light
            as="h1"
          />
        </div>
      </section>

      <section className="section section--white">
        <div className="container legal-copy">
          <h2>You can close this page</h2>
          <p>
            Go back to the Indigen app and open your campaign. It checks with
            Paystack directly and updates itself — usually within a few seconds
            of you returning.
          </p>

          {reference && (
            <>
              <h2>Your reference</h2>
              <p>
                Quote this if you ever need to ask us about the payment.
              </p>
              <p>
                <code>{reference}</code>{" "}
                <Button
                  type="button"
                  variant="secondary"
                  size="small"
                  onClick={copyReference}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </p>
            </>
          )}

          <h2>If nothing has changed in the app</h2>
          <p>
            Open the campaign and tap <strong>I have paid — check now</strong>.
            If it still says it is waiting after a few minutes, do not start
            another payment yet. A delayed status does not prove whether a
            charge completed.
          </p>
          <p>
            <Link to="contact">Get in touch</Link> with the reference above and
            we will verify the transaction before you try again. If Paystack
            and the app both confirm that the checkout was abandoned or
            declined, you can then start a new checkout from the campaign.
          </p>

          <h2>What happens next</h2>
          <p>
            A paid campaign goes to our reviewers before it runs. You will get a
            notification and an email either way, and the campaign screen in the
            app shows where it has got to.
          </p>
        </div>
      </section>
    </>
  );
}
