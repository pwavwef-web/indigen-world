import { Button } from "@indigen-world/web-ui";
import { PageMotion } from "../components/PageMotion";
import { SectionHeading } from "../components/SectionHeading";
import { Link } from "../app/router";
import { useDocumentMeta } from "../lib/useDocumentMeta";

/** A redirect is a lookup hint; only the authenticated server verifies payment. */
export function ShopPaymentCompletePage() {
  useDocumentMeta("Return to your order", "Return to Indigen World to check your shop order and verified payment status.", { noindex: true });
  const query = new URLSearchParams(window.location.search);
  const candidate = query.get("reference") ?? query.get("trxref") ?? "";
  const reference = /^shop_[a-f0-9]{40}$/.test(candidate) ? candidate : null;
  const appLink = reference
    ? `indigen://shop/payment-complete?reference=${encodeURIComponent(reference)}`
    : "indigen://shop/payment-complete";
  return <>
    <section className="page-hero page-hero--legal">
      <PageMotion />
      <div className="container">
        <SectionHeading eyebrow="Indigen World Shop" title="Return to your order" light />
        <p>Your checkout has closed. Open Indigen World to check the verified payment status and delivery details.</p>
      </div>
    </section>
    <section className="section"><div className="container prose">
      <h2>Check your order in the app</h2>
      <p>This page does not confirm a payment. Your order is updated only after our server verifies the transaction with Paystack.</p>
      {reference && <p>Payment reference: <code style={{ overflowWrap: "anywhere" }}>{reference}</code></p>}
      <Button onClick={() => window.location.assign(appLink)}>Open Indigen World</Button>
      <p>If the app does not open, return to <strong>Shop → Profile → Orders</strong> in Indigen World and open your order.</p>
      <h2>If the status is still waiting</h2>
      <p>A delayed update does not prove whether a charge completed. Keep your payment reference and check the same order again before starting another payment.</p>
      <p><Link to="contact">Contact Indigen World</Link> if you need help checking the transaction.</p>
    </div></section>
  </>;
}
