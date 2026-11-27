# Contributing

This is **v1-web**, part of INVICTUS v1 on Robinhood Chain: the Next.js dashboard, which reaches the backend only
through its `/api` proxy. v1 is in production and maintained: it takes fixes and small changes, while new product work
goes to [invictus](https://github.com/InvictusLP/invictus). How the three v1 repositories fit together, and every
environment variable, is in [ARCHITECTURE.md](ARCHITECTURE.md).

## Before you start

- Read the organisation [handbook](https://github.com/InvictusLP/handbook): onboarding, workflow and conventions.
- Open or pick an issue first, and say in it that you are taking it.
- Never commit a secret. `.env` stays local; `.env.example` lists the names only.

## Making a change

1. Branch from `main`.
2. Keep the change small and focused, with a test where the behaviour can be tested.
3. Run the checks below; CI runs the same ones on every pull request.
4. Open a pull request that says what changed, why, and how you verified it.

```sh
npm ci
npm run typecheck
npm test
npm run build
```

A change to the HTTP contract between the repositories (`shared/`, the `/api` and `/internal/bot` routes) lands in every
repository that uses it, and in [ARCHITECTURE.md](ARCHITECTURE.md), which is kept identical in all three.

## Security

Report a vulnerability privately, as the organisation [security
policy](https://github.com/InvictusLP/.github/blob/main/SECURITY.md) describes, never in a public issue.
