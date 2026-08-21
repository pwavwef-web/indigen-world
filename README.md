# Indigen World

Indigen World is the umbrella cultural-technology ecosystem for language preservation, cultural learning, storytelling, creator enablement, and community-governed digital heritage.

It delivers three user-facing products:

1. **Indigen World Website** — the public home for programmes, stories, communities, impact, partnerships, and support.
2. **TribeStudio** — the creator, contributor, validator, campaign, analytics, and administration workspace.
3. **Indigen World Mobile** — the Flutter app for everyday users to explore, learn, save, contribute, and earn rewards.

A shared Firebase and provider-independent AI infrastructure supports the ecosystem. **Project Kasena is Indigen World’s flagship Kasem-language programme** and the first implementation of its reusable language-cell model.

## Repository model

This is a monorepo. User-facing applications, backend services, shared contracts, Firebase configuration, governance documentation, and brand assets live together so that the ecosystem can evolve from one source of truth.

```text
indigen-world/
├── apps/
│   ├── website/
│   ├── tribestudio/
│   ├── admin/
│   └── mobile/
├── services/
│   ├── functions/
│   └── ai/
├── packages/
│   ├── contracts/
│   ├── design-tokens/
│   └── web-ui/
├── firebase/
├── assets/
├── docs/
└── .github/
```

See [`docs/architecture/repository-structure.md`](docs/architecture/repository-structure.md) for boundaries and ownership.

## Product ownership

| Area | Lead |
|---|---|
| Project management and cross-product consistency | Francis Pwavwe |
| Indigen World website | Francis E. Onai |
| TribeStudio | Chinedum Okwonko Udeaja |
| Indigen World mobile app | Andy Anim |
| Firebase, shared contracts, and AI infrastructure | Shared technical ownership with explicit reviewers |

GitHub usernames for product leads should be added to `.github/CODEOWNERS` once confirmed.

## Architectural principles

- **Kasem first, reusable by design.** Project Kasena proves the language-cell model before new language communities are added.
- **Community governance is infrastructure.** Every relevant record must preserve source, contributor, validation, dialect, consent, licence, and cultural-permission metadata.
- **Firebase is the shared platform.** Firebase Authentication, Firestore, Cloud Storage, Functions, Hosting, App Check, and Remote Config are the default services unless an architecture decision record states otherwise.
- **AI remains provider-independent.** Apps call controlled backend services; model credentials and provider-specific logic must never live in clients.
- **Low-bandwidth and offline use matter.** Web and mobile experiences must account for constrained networks and older devices.
- **No raw community corpus in Git.** The repository stores schemas, synthetic fixtures, migrations, and approved public samples only.

## Development status

The repository currently contains the approved architecture scaffold. Product implementation should be added inside the relevant application or service folder without changing the product boundaries casually.

## Before contributing

Read:

- [`CONTRIBUTING.md`](CONTRIBUTING.md)
- [`SECURITY.md`](SECURITY.md)
- [`docs/governance/data-safety.md`](docs/governance/data-safety.md)
- [`docs/product/product-boundaries.md`](docs/product/product-boundaries.md)

## Local configuration

Never commit production secrets. Copy `.firebaserc.example` to `.firebaserc` locally and use Firebase Secret Manager or approved environment-variable workflows for sensitive values.

## Run the public website locally

Install [Node.js 22.12 or newer](https://nodejs.org/), then run these commands from the repository root:

```bash
npm install
npm run dev --workspace @indigen-world/website
```

Keep the terminal running while you use the website.

### Desktop

Open the `Local` address printed by Vite, normally [http://localhost:5173](http://localhost:5173), in your desktop browser.

### Mobile

1. Connect the phone and development computer to the same Wi-Fi network.
2. Start the website with the command above.
3. On the phone, open the `Network` address printed by Vite, for example `http://192.168.1.20:5173`.
4. If prompted by the computer's firewall, allow Node.js to communicate on the private network.

The network address varies by computer and network. Mobile access works only while the development server is running and the phone can reach the computer on the local network.

## Licence status

No open-source licence has been selected. Source code, cultural materials, language data, visual assets, and documentation may have different ownership and permission requirements. See [`docs/governance/licensing-status.md`](docs/governance/licensing-status.md).
