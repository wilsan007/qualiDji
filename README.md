# QualiDji

SaaS platform for ISO compliance management (ISO 9001:2015 & ISO 22000:2018) for the Djibouti market.

## Languages

The application supports 4 languages:
- **Français** (fr) — default
- **English** (en)
- **العربية** (ar) — with RTL support
- **Soomaali** (so)

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, React 19, Tailwind CSS, shadcn/ui
- **i18n**: next-intl with `[locale]` routing
- **Backend**: Supabase (PostgreSQL 16, Auth, Storage, Realtime, Edge Functions)
- **Testing**: Vitest (unit), Playwright (e2e), pgTAP (SQL)
- **CI**: GitHub Actions

## Project Structure

```
qualidji/
├── apps/
│   └── web/                    # Next.js application
│       ├── app/[locale]/       # Locale-based routing
│       │   ├── page.tsx        # Landing page
│       │   ├── auth/           # Login, register, invite
│       │   └── tenant/         # Tenant dashboard
│       ├── components/         # UI components (shadcn/ui + custom)
│       ├── i18n/               # next-intl configuration
│       ├── lib/                # Utilities, Supabase clients, types
│       ├── messages/           # Translation files (fr, en, ar, so)
│       └── tests/              # Unit and e2e tests
├── supabase/
│   ├── migrations/             # SQL migrations
│   ├── tests/                  # pgTAP tests
│   └── config.toml             # Supabase configuration
├── packages/                   # Shared packages (future)
└── .github/workflows/          # CI configuration
```

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm 9+
- Supabase CLI (optional, for local development)

### Installation

```bash
cd qualidji
pnpm install
```

### Environment

```bash
cp apps/web/.env.example apps/web/.env.local
# Edit .env.local with your Supabase credentials
```

### Development

```bash
pnpm dev          # Start Next.js dev server
pnpm build        # Production build
pnpm test         # Run unit tests
pnpm test:e2e     # Run e2e tests
pnpm lint         # Lint
pnpm typecheck    # Type check
```

### Supabase (local)

```bash
cd supabase
supabase start    # Start local Supabase
supabase db push  # Apply migrations
supabase test db  # Run pgTAP tests
```

## Development Plan

9 phases / 24 sprints (2 weeks each) for 2 developers:

- **Phase 0** (Sprints 1-2): Foundation, monorepo, auth, RLS
- **Phase 1** (Sprints 3-4): Requirements engine, diagnostic
- **Phase 2** (Sprints 5-7): Tasks, evidence, offline mobile
- **Phase 3** (Sprints 8-9): Verification, anti-cheat, notifications
- **Phase 4** (Sprints 10-12): ISO 9001 core + MVP
- **Phase 5** (Sprints 13-14): ISO 9001 complements
- **Phase 6** (Sprints 15-16): Adaptive guidance + AI assistant
- **Phase 7** (Sprints 17-20): ISO 22000 / food safety
- **Phase 8** (Sprints 21-24): External auditor portal, enterprise, industrialization
