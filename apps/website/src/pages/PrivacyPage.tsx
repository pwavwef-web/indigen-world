/**
 * src/pages/PrivacyPage.tsx
 *
 * New page — the uploaded template had no Privacy or Terms page at
 * all, despite both being P0 in the brief's sitemap. Marked in-page as
 * a placeholder pending the project manager's approved legal copy,
 * since legal text sign-off isn't a website-lead decision per the
 * brief's decision-boundaries section.
 *
 * The website is the ecosystem's canonical legal home: the Indigen
 * World mobile app and TribeStudio have no separate privacy pages, so
 * this notice covers all three surfaces. Product-specific sections
 * describe what each collects rather than pretending one flat policy
 * fits a marketing site, a consumer app, and a contributor workspace.
 *
 * The keyboard section is not optional decoration. Google Play requires an
 * app that ships an input method to disclose how typed text is handled, and
 * this notice is the disclosure the Play listing points at. The claims in it
 * are enforced by the code: KasemInputMethodService writes to the active app's
 * InputConnection and holds no reference to Firebase, to the network, or to
 * the Flutter engine, and KasemKeyboardChannel carries settings only — it has
 * no method that accepts or returns typed text. If that ever changes, this
 * section has to change first.
 */
import { useDocumentMeta } from "../lib/useDocumentMeta";
import { ROUTES_BY_PATH } from "../content/navigation";
import { SectionHeading } from "../components/SectionHeading";
import { Link } from "../app/router";

const route = ROUTES_BY_PATH["privacy"];

export function PrivacyPage() {
  useDocumentMeta(route.title, route.description);

  return (
    <>
      <section className="page-hero page-hero--legal">
        <div className="container">
          <SectionHeading eyebrow="Legal" title="Privacy notice" light as="h1" />
        </div>
      </section>

      <section className="section section--white">
        <div className="container legal-copy">
          <h2>Who this covers</h2>
          <p>
            Indigen World is one ecosystem with three user-facing products: this public website,
            the Indigen World mobile app (Indigen), and TribeStudio for creators, contributors and
            validators. An internal Admin console supports governance and is not offered to the
            public. This notice explains what each product collects and why. Where a product does
            something different, it is called out in its own section below.
          </p>

          <h2>This website</h2>
          <p>
            When you use a form on this site — including Contact, Get Involved, tester programme
            administration, or Venacula, the Indigen World newsletter — we collect only the fields
            shown on that form. Depending on the form, this may include your name, contact details,
            testing email, country, consent choices, and the message or note you provide.
          </p>

          <h2>How we use it</h2>
          <p>
            Contact and Get Involved submissions are used to respond to you and route your request.
            Tester programme details are used to verify participation and prepare, deliver and
            administer the recognition or rewards described on the relevant form.
            If you subscribe to Venacula, we use your email only to send the newsletter and related
            Indigen World updates. We do not sell this information or publish form responses.
            Newsletter delivery will not begin until every email can include a working unsubscribe
            link.
          </p>

          <h2>What we don't collect here</h2>
          <p>
            This website's general forms are not for audio recordings, sacred or restricted
            cultural knowledge, minors' data, or detailed cultural submissions. Language and
            cultural contributions belong to the consent-based process inside the mobile app and
            TribeStudio, described below.
          </p>

          <h2>The Indigen World mobile app</h2>
          <p>
            The mobile app is offline-first, and much of what you create stays on your device.
            Saved words, drafts of contributions and corrections, and your explicit offline
            submission queue are stored locally on your phone until you choose to sync or submit
            them.
          </p>
          <p>
            When you sign in, submit a contribution or correction, post in the community preview,
            or interact with Explore (likes, comments, saves), the relevant content and your
            account identity are sent to our Firebase backend so the feature can work and, where
            applicable, be reviewed. Community posts and their media attachments, threaded replies,
            and attributed Explore content are shared with other users of that surface by design.
          </p>
          <p>
            Contribution rewards and points remain pending until a trusted reviewer approves the
            underlying contribution — we store the contribution and its review state, not a promise
            of payment. Dictionary fixtures shipped in the beta are clearly labelled synthetic data,
            not real community language data.
          </p>

          <h2>The Kasem keyboard</h2>
          <p>
            The Android app includes an optional Kasem keyboard — a system input method you can
            switch on in Android's own keyboard settings. Android requires you to enable and select
            it yourself; it is never turned on for you.
          </p>
          <p>
            <strong>The keyboard does not collect anything.</strong> It has no learning
            dictionary, no prediction, no typing history and no analytics. What you type goes
            directly to the app you are typing into and nowhere else. It is never stored, never
            sent to Indigen World or any other server, and never passed into the rest of the
            Indigen app — there is no code path from the keyboard to our backend, and the keyboard
            works with no network connection at all.
          </p>
          <p>
            The only things it saves are the three settings on its own page: which language it
            starts in, and whether key presses vibrate or make a sound. Those stay on your device.
            This applies wherever you use it — in Indigen, in a messaging app, in a browser, or
            anywhere else you can type.
          </p>

          <h2>Recordings, and playing music in the background</h2>
          <p>
            The app asks for your microphone only at the moment you choose to record — saying a
            word for a dictionary entry, or recording audio for a contribution. Nothing is captured
            before you start a recording or after you stop it, and a recording stays on your device
            until you submit it. If you submit one, it travels with the contribution it belongs to
            and is reviewed like any other contribution.
          </p>
          <p>
            When you play something from the music library, playback continues while the app is in
            the background or your screen is off, and a notification with the usual controls is
            shown for as long as it is playing. That is the only reason the app runs a background
            service, and it runs only while there is something playing.
          </p>

          <h2>TribeStudio</h2>
          <p>
            TribeStudio is a workspace for signed-in creators, contributors, cultural custodians
            and validators. Sign-in is handled by Firebase Authentication, and your role is read
            from an access claim on your account. We process the content you submit — lexical
            entries, corrections, stories, proverbs, oral histories and media — together with the
            dialect, source, consent, licence and cultural-permission metadata attached to it.
          </p>
          <p>
            Validators' review notes and decisions (approve, reject, request changes) and the
            resulting audit records are stored so that content governance is accountable and
            traceable. Campaign and bounty participation and contributor history are retained to
            operate rewards and show your own record of work.
          </p>

          <h2>Cultural data and consent</h2>
          <p>
            Language and cultural content is governed, not just collected. Consent, licensing and
            cultural-permission metadata travel with the content it describes, and restricted or
            sacred material is handled through the dedicated, consent-based contribution flows —
            never through this website's general forms. We do not repurpose cultural submissions
            beyond the permissions recorded with them.
          </p>

          <h2>Analytics</h2>
          <p>
            Where privacy-safe analytics are enabled, they are limited to high-level events such as
            page views, screen views, CTA choices and submission outcomes. Analytics never capture
            the contents of form messages, phone numbers, personal or cultural content. In the
            mobile app, production telemetry is disabled outside the production build.
          </p>

          <h2>Your rights</h2>
          <p>
            You can ask us to correct or delete information you've submitted at any time through
            the <Link to="contact">contact page</Link>. In the mobile app, locally-stored saved
            words and drafts can be removed on your own device. During this MVP stage, account and
            server-side requests are handled manually by the team.
          </p>

          <p className="legal-disclaimer">
            This page is a plain-language implementation summary, not final legal text. Approved
            legal copy from the project manager will replace this before public launch.
          </p>
        </div>
      </section>
    </>
  );
}
