# FinLedger (frontend)

This directory contains the React + TypeScript front-end for FinLedger. It was bootstrapped with Vite and provides a CSV-driven personal finance dashboard.

## Available scripts

Inside this folder run:

- `npm run dev` – start the development server with hot module replacement
- `npm run build` – create an optimised production build in `dist`
- `npm run preview` – preview the production build locally
- `npm run lint` – run ESLint against the source files

## Tech stack

- [React](https://react.dev/) with hooks and functional components
- [TypeScript](https://www.typescriptlang.org/)
- [Vite](https://vite.dev/) for fast bundling and DX

Re-importing the same CSV file is safe—the app deduplicates matching transactions to avoid skewed totals.

## Project structure

```
src/
├── App.tsx      # Main finance dashboard
├── App.css      # Component styles
├── index.css    # Global theme variables
├── main.tsx     # Application bootstrap
└── assets/      # Static assets from the Vite template
```

Transactions are stored in `localStorage`, so clearing site data resets the dashboard.

## Sample data

- Click **Load sample data** in the import panel to pre-fill the dashboard with realistic transactions.
- The raw file lives at [`public/sample-transactions.csv`](public/sample-transactions.csv) if you need to inspect or edit it.
