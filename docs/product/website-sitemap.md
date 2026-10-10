# Indigen World website sitemap

This document is the human-readable information architecture for the public
website at `https://indigenworld.com`. The crawler-facing version lives at
`apps/website/public/sitemap.xml`.

```text
Indigen World
|
+-- Home                         /
|   +-- About                    /about
|   +-- Learn Kasem              /learn
|   |   +-- Words and recordings /dictionary
|   |   +-- Book reference guides /spelling-guide.html, /grammar-guide.html
|   +-- Ecosystem                /ecosystem
|   |   +-- Project Kassena      /project-kassena
|   |       +-- Kasem Dictionary /dictionary
|   +-- Contribute               /contribute
|   +-- Impact & Governance      /impact-governance
|   +-- Get Involved             /get-involved
|   +-- Contact                  /contact
|   +-- Legal
|       +-- Privacy              /privacy
|       +-- Terms                /terms
|
+-- Experiences (shared by link, full screen)
|   +-- Beyond the Reef          /beyond-the-reef
|
+-- Utility routes (not indexed)
    +-- Advert checkout result   /ads/payment-complete
    +-- Page not found           any unknown path
```

## Page inventory

| Page | Route | Primary purpose | Discovery | Search indexing |
| --- | --- | --- | --- | --- |
| Home | `/` | Introduce the mission, products and next steps | Brand link, header | Included |
| About | `/about` | Explain the mission, principles and team | Header, footer | Included |
| Learn Kasem | `/learn` | Connect word discovery, saved words, book guides, expressions and practice; explain availability | Header, footer, home learning path, dictionary, Project Kassena | Included |
| Ecosystem | `/ecosystem` | Show the public products, programmes and infrastructure | Header, footer | Included |
| Project Kassena | `/project-kassena` | Explain the flagship Kasem-language programme | Header, footer, ecosystem | Included |
| Kasem Dictionary | `/dictionary` | Let visitors search and save published Kasem words | Header, footer, Project Kassena | Included |
| Contribute | `/contribute` | The open Everyday Kasem expressions campaign: the task, the review process, published expressions, and the call to action into TribeStudio | Header, footer, home hero and paths, Get Involved | Included |
| Impact & Governance | `/impact-governance` | Explain cultural-data stewardship and impact targets | Header, footer | Included |
| Get Involved | `/get-involved` | Route contributors, partners, researchers and supporters | Primary call to action, footer | Included |
| Contact | `/contact` | Handle general, correction, publication and takedown enquiries | Footer | Included |
| Privacy | `/privacy` | Explain privacy practices | Footer | Included |
| Terms | `/terms` | Explain terms of use | Footer | Included |
| Beyond the Reef | `/beyond-the-reef` | The song as an interactive music film: synchronised rising lyrics over generated imagery and footage | Shared links; not in the header or footer | Included |
| Advert checkout result | `/ads/payment-complete` | Return advertisers from Paystack checkout | Transactional redirect only | Excluded (`noindex`) |
| Page not found | Any unknown path | Recover from an invalid or retired URL | Direct invalid URL only | Excluded (`noindex`) |

## Primary journeys

1. **Learn Kasem:** Home or header -> Learn -> words with recordings, saved words, book guides and published expressions. Public reading needs no account; the practice Lab labels its own access requirements. The home hero still links directly to the dictionary.
2. **Contribute Kasem:** Home (hero or the Contribute path) -> Contribute -> TribeStudio
   `/studio/expressions` (Google sign-in) -> "Your expressions" for the review status.
3. **Understand the mission:** Home -> About -> Impact & Governance.
4. **Explore the work:** Home -> Ecosystem -> Project Kassena -> Kasem Dictionary.
5. **Other involvement:** Home or any header -> Get Involved -> Contact when a direct conversation is needed.
6. **Review trust information:** Any footer -> Privacy or Terms.

## Maintenance rules

- Treat `apps/website/src/content/navigation.ts` as the source of truth for
  route names, labels and indexing intent.
- Add every indexable public route to `apps/website/public/sitemap.xml`.
- Keep transactional, account-only and error routes out of the XML sitemap and
  mark them `noindex`.
- Update this document when a page is added, renamed, retired or moved in the
  navigation hierarchy.
- Keep `apps/website/public/robots.txt` pointed at the canonical XML sitemap.
