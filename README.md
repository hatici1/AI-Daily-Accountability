# FinLedger

FinLedger is a lightweight personal finance dashboard that lets you upload CSV exports from your bank and explore your income and expenses. The tool runs entirely in the browser and stores transactions locally so you keep full control over your data.

## Features

- Import CSV statements with automatic delimiter and header detection
- Categorise transactions with sensible defaults for common German banking exports
- Filter by month or search by description, payee, or category
- Visualise spending by category and keep an eye on income, expenses, and balance totals
- Switch between dark and light theme, with preferences saved in local storage

## Getting started

1. Install dependencies and start the development server:

   ```bash
   cd app
   npm install
   npm run dev
   ```

2. Open the provided local URL in your browser.
3. Upload a CSV export from your online banking portal. The parser understands German style dates (`31.12.2024`) and decimal commas.

## CSV requirements

| Column               | Notes                                                                 |
| -------------------- | --------------------------------------------------------------------- |
| `Buchungstag`        | Booking date (`DD.MM.YYYY`). Used for filtering and ordering.         |
| `Valutadatum`        | Optional value date.                                                  |
| `Betrag`             | Required amount column. Negative values represent expenses.           |
| `Währung` / `Waehrung` | Currency. Defaults to EUR if missing.                                 |
| `Beschreibung` / `Verwendungszweck` | Description of the transaction.                                     |
| `Beguenstigter/Zahlungspflichtiger` | Optional payee/recipient column for additional context.            |

Additional columns are stored and kept available for future enhancements.

## Building for production

Run the following command to create an optimised production build inside `app/dist`:

```bash
cd app
npm run build
```

## License

This project is provided as-is for educational purposes.
