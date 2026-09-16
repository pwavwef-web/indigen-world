# Two doors are open: Google Play production access and Paystack

Milestone post for 2026-09-16. Google Play granted Indigen World production
access, and Indigen World was activated on Paystack. This is not a release post.
Nothing new shipped to users, and the post says plainly that there is no public
launch yet.

| Field | Value |
|---|---|
| Title | Two doors are open: Google Play production access and Paystack activation |
| Topic | Indigen World gets Google Play production access and an active Paystack account; testing continues before a public launch |
| Labels | `Community`, `Mobile app`, `Platform` (in that order: related posts follow the first label) |
| Search description | Google Play has granted Indigen World production access and Paystack is activated. What it means, what we still check before launch, and why testing continues. (159 characters) |
| Permalink (custom) | `google-play-production-access-paystack` |
| Reading time | about 4 minutes |
| Cover | `cover.png` (1200×630) |

## Images

Upload them in this order. The first image is the share card.

| # | File | Size | What it shows | Placeholder in `post.html` |
|---|---|---|---|---|
| 1 | `cover.png` | 1200×630 | "Two doors are open", with Google Play and Paystack status cards | `REPLACE-WITH-UPLOADED-cover.png` |
| 2 | `images/road-to-launch.png` | 1600×960 | Two approvals done, five checks still to confirm | `REPLACE-WITH-UPLOADED-road-to-launch.png` |

Both images are drawn graphics, not app screenshots. The Play and Paystack marks are generic
icons, not the companies' logos. Re-render them with
`node apps/updates-blog/posts/2026-09-16-production-access-and-paystack/mockups/render.mjs`
(Google Chrome must be installed).

## Before publishing

- **Membership wording (decided 2026-09-16).** The WhatsApp announcement said Paystack is for
  "memberships and other paid services". That was a mistake, and the post follows the code:
  memberships go through **Google Play Billing** (`indigen_plus`, `indigen_patron`,
  `indigen_creator`), and Paystack is for **advertising campaigns** only. You may want to
  correct the WhatsApp message too.
- **Payments are live.** Live Paystack keys were deployed to the three ad-payment functions
  on 2026-09-15. That is why the post's "Heads up" tells testers that payments are real.
  The checklist still lists an end-to-end live payment as unconfirmed.
- Post this after the WhatsApp announcement, or at the same time, so the two say the same
  thing.

## Publishing in Blogger

1. Go to **Posts → New post** and enter the title.
2. Switch to **HTML view** and paste all of `post.html`.
3. Switch to **Compose view**. Delete each broken image and use **Insert image → Upload from
   computer** to add the file from the table in the same place. Keep the cover as the first image.
4. Back in **HTML view**, check that each `<img>` still has its `alt` text. If Blogger dropped
   it, copy it back from `post.html`.
5. In **Post settings**, add the labels in order and the search description, then set
   **Permalink** to Custom with the value above.
6. **Preview**, then **Publish**.

The callout classes (`iw-lede`, `iw-ship`, `iw-note`, `iw-tip`, `iw-warn`, `iw-cols`) come
from the Updates theme. The post has 7 `h2`/`h3` headings, so the table of contents builds
itself.

## Short share text

For WhatsApp, X or Facebook, linking to the post:

> 🚀 Big milestone for Indigen World: Google Play has granted us production access, and our
> Paystack account is now active. We're not launching publicly yet. Here's what still has to
> happen, and why testers matter more than ever 👇
> [post link]
