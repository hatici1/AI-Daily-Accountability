import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type Transaction = {
  id: string;
  bookingDate: string;
  valueDate?: string;
  description: string;
  payee?: string;
  amount: number;
  currency: string;
  category: string;
  raw: Record<string, string | undefined>;
};

type Theme = "light" | "dark";

type HeaderMap = {
  bookingDate: number;
  valueDate: number;
  description: number;
  payee: number;
  amount: number;
  currency: number;
};

const STORAGE_KEY = "finance-app/transactions";
const THEME_KEY = "finance-app/theme";
const DEFAULT_CURRENCY = "EUR";

const GERMAN_HEADERS: Record<keyof Omit<HeaderMap, never>, string[]> = {
  bookingDate: [
    "Buchungstag",
    "Buchungstag (DD.MM.YYYY)",
    "Buchungstag\u00a0",
    "Datum",
  ],
  valueDate: ["Valutadatum", "Wertstellung"],
  description: ["Verwendungszweck", "Buchungstext", "Text", "Beschreibung"],
  payee: [
    "Beguenstigter/Zahlungspflichtiger",
    "Empfaenger",
    "Zahlungspflichtiger",
    "Auftraggeber/Empfaenger",
    "Name",
  ],
  amount: ["Betrag", "Umsatz in EUR", "Betrag (€)", "Umsatz", "Betrag EUR"],
  currency: ["Waehrung", "Währung", "Currency"],
};

function normaliseHeader(header: string): string {
  return header.replace(/^\uFEFF/, "").replace(/\u00a0/g, " ").trim();
}

function detectDelimiter(line: string): string {
  const candidates = [";", ",", "\t", "|"];
  let bestDelimiter = ",";
  let bestCount = 0;
  candidates.forEach(candidate => {
    const segments = line.split(candidate).length;
    if (segments > bestCount) {
      bestDelimiter = candidate;
      bestCount = segments;
    }
  });
  return bestDelimiter;
}

function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/)[0] ?? ",";
  const delimiter = detectDelimiter(firstLine);
  const rows: string[][] = [];
  let currentField = "";
  let inQuotes = false;
  let currentRow: string[] = [];

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? "";
    if (inQuotes) {
      if (char === "\"" && text[i + 1] === "\"") {
        currentField += "\"";
        i += 1;
      } else if (char === "\"") {
        inQuotes = false;
      } else {
        currentField += char;
      }
      continue;
    }

    if (char === "\"") {
      inQuotes = true;
    } else if (char === delimiter) {
      currentRow.push(currentField);
      currentField = "";
    } else if (char === "\n") {
      currentRow.push(currentField);
      if (currentRow.some(field => (field ?? "").trim() !== "")) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentField = "";
    } else if (char === "\r") {
      // ignore
    } else {
      currentField += char;
    }
  }

  currentRow.push(currentField);
  if (currentRow.some(field => (field ?? "").trim() !== "")) {
    rows.push(currentRow);
  }
  return rows;
}

function mapHeader(header: string[]): HeaderMap {
  const resolveIndex = (aliases: string[]) =>
    header.findIndex(column =>
      aliases.some(alias => normaliseHeader(column).toLowerCase() === alias.toLowerCase()),
    );

  return {
    bookingDate: resolveIndex(GERMAN_HEADERS.bookingDate),
    valueDate: resolveIndex(GERMAN_HEADERS.valueDate),
    description: resolveIndex(GERMAN_HEADERS.description),
    payee: resolveIndex(GERMAN_HEADERS.payee),
    amount: resolveIndex(GERMAN_HEADERS.amount),
    currency: resolveIndex(GERMAN_HEADERS.currency),
  };
}

function toIsoDateGerman(value: string): string | undefined {
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})[.](\d{1,2})[.](\d{2,4})$/);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]);
  let year = Number(match[3]);
  if (Number.isNaN(day) || Number.isNaN(month) || Number.isNaN(year)) return undefined;
  if (year < 100) {
    year += 2000;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString().slice(0, 10);
}

function parseAmountGerman(value: string): number | undefined {
  if (!value) return undefined;
  const normalised = value
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .replace(/€/g, "")
    .replace(/\u2212/g, "-")
    .replace(/,$/, "");
  const trailingMinus = /-$/.test(normalised);
  const cleaned = normalised.replace(/-$/, "");
  const parsed = Number(cleaned);
  if (Number.isNaN(parsed)) return undefined;
  if (trailingMinus) {
    return -Math.abs(parsed);
  }
  return parsed;
}

function categorise(transaction: Pick<Transaction, "description" | "payee" | "amount">): string {
  const haystack = `${transaction.description} ${transaction.payee ?? ""}`.toLowerCase();
  if (transaction.amount > 0) return "Income";
  if (/(aldi|lidl|rewe|edeka|penny|kaufland|netto|dm|rossmann)/.test(haystack)) return "Groceries";
  if (/(miete|vermieter|kaltmiete|warmmiete|rent)/.test(haystack)) return "Rent";
  if (/(strom|gas|wasser|energie|enbw|rwe|eon)/.test(haystack)) return "Utilities";
  if (/(db|bahn|swb|kvb|verkehrsbetriebe|tankstelle|shell|esso|aral)/.test(haystack)) return "Transport";
  if (/(amazon|zalando|ikea|decathlon|saturn|mediamarkt)/.test(haystack)) return "Shopping";
  if (/(restaurant|delivery|wolt|lieferando|mc ?donald|burger king|subway|pizza)/.test(haystack)) return "Eating Out";
  if (/(apotheke|arzt|praxis|zahnarzt|klinik)/.test(haystack)) return "Healthcare";
  if (/(spotify|netflix|disney|adobe|microsoft|apple|icloud|prime)/.test(haystack)) return "Subscriptions";
  if (/(geb\u00fchr|konto|dispo|zinsen|entgelt|fee)/.test(haystack)) return "Fees";
  if (/(uni|hochschule|semester|studien|tuition)/.test(haystack)) return "Education";
  if (/(versicherung|versicherungsschutz|allianz|axa)/.test(haystack)) return "Insurance";
  if (/(urlaub|reise|hotel|airbnb|ryanair|eurowings)/.test(haystack)) return "Travel";
  return "Other";
}

function safeJsonParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    console.warn("Failed to parse JSON from localStorage", error);
    return fallback;
  }
}

function generateId(index: number): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
}

const formatterFor = (currency: string) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency, currencyDisplay: "symbol" });

function usePersistentTheme(): [Theme, (value: Theme | ((current: Theme) => Theme)) => void] {
  const prefersDark =
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;

  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem(THEME_KEY) as Theme | null;
    if (stored === "dark" || stored === "light") {
      return stored;
    }
    return prefersDark ? "dark" : "light";
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  return [theme, setTheme];
}

function usePersistentTransactions(): [Transaction[], React.Dispatch<React.SetStateAction<Transaction[]>>] {
  const [transactions, setTransactions] = useState<Transaction[]>(() =>
    safeJsonParse<Transaction[]>(localStorage.getItem(STORAGE_KEY), []),
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(transactions));
  }, [transactions]);

  return [transactions, setTransactions];
}

export default function App() {
  const [transactions, setTransactions] = usePersistentTransactions();
  const [theme, setTheme] = usePersistentTheme();
  const [selectedMonth, setSelectedMonth] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const months = useMemo(() => {
    const monthSet = new Set<string>();
    transactions.forEach(tx => {
      if (tx.bookingDate.length >= 7) {
        monthSet.add(tx.bookingDate.slice(0, 7));
      }
    });
    return Array.from(monthSet).sort().reverse();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return transactions.filter(tx => {
      const matchesMonth = !selectedMonth || tx.bookingDate.startsWith(selectedMonth);
      const matchesQuery =
        query.length === 0 ||
        `${tx.description} ${tx.payee ?? ""} ${tx.category}`.toLowerCase().includes(query);
      return matchesMonth && matchesQuery;
    });
  }, [transactions, selectedMonth, searchQuery]);

  const totals = useMemo(() => {
    return filteredTransactions.reduce(
      (acc, tx) => {
        if (tx.amount >= 0) {
          acc.income += tx.amount;
        } else {
          acc.expense += tx.amount;
        }
        return acc;
      },
      { income: 0, expense: 0 },
    );
  }, [filteredTransactions]);

  const currency = transactions[0]?.currency ?? DEFAULT_CURRENCY;
  const formatCurrency = useMemo(() => formatterFor(currency), [currency]);

  const categoryTotals = useMemo(() => {
    const accumulator = new Map<string, { income: number; expense: number }>();
    filteredTransactions.forEach(tx => {
      const key = tx.category || "Other";
      const entry = accumulator.get(key) ?? { income: 0, expense: 0 };
      if (tx.amount >= 0) {
        entry.income += tx.amount;
      } else {
        entry.expense += Math.abs(tx.amount);
      }
      accumulator.set(key, entry);
    });

    return Array.from(accumulator.entries())
      .map(([category, value]) => ({
        category,
        income: value.income,
        expense: value.expense,
        net: value.income - value.expense,
      }))
      .sort((a, b) => b.expense - a.expense || b.income - a.income || a.category.localeCompare(b.category));
  }, [filteredTransactions]);

  const totalExpensesForShare = categoryTotals.reduce((sum, item) => sum + item.expense, 0);

  const resetData = () => {
    if (confirm("Remove all stored transactions?")) {
      setTransactions([]);
      setSelectedMonth("");
      setSearchQuery("");
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  const toggleTheme = () => {
    setTheme(current => (current === "dark" ? "light" : "dark"));
  };

  const handleParsedTransactions = (parsed: Transaction[]) => {
    setTransactions(existing =>
      [...parsed, ...existing].sort((a, b) => (a.bookingDate < b.bookingDate ? 1 : -1)),
    );
  };

  const handleFileList = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const [file] = files;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const rawText = String(reader.result ?? "");
        let rows = parseCsv(rawText);
        if (rows.length === 0) {
          throw new Error("Die CSV-Datei enthält keine Daten.");
        }
        while (rows.length > 0 && rows[0].every(cell => !cell || !cell.trim())) {
          rows = rows.slice(1);
        }
        if (rows.length === 0) {
          throw new Error("Die CSV-Datei enthält keine Datenzeilen.");
        }
        const header = rows[0].map(normaliseHeader);
        const headerMap = mapHeader(header);
        if (headerMap.bookingDate < 0 || headerMap.amount < 0) {
          throw new Error(
            "Konnte Buchungsdatum oder Betrag in der Kopfzeile nicht finden. Bitte prüfen Sie die CSV-Datei.",
          );
        }
        const newTransactions: Transaction[] = rows.slice(1).map((row, index) => {
          const rowAsObject: Record<string, string | undefined> = {};
          header.forEach((key, idx) => {
            rowAsObject[key] = row[idx];
          });
          const bookingRaw = String(row[headerMap.bookingDate] ?? "");
          const valueRaw = headerMap.valueDate >= 0 ? String(row[headerMap.valueDate] ?? "") : "";
          const amountRaw = String(row[headerMap.amount] ?? "");
          const descriptionRaw = headerMap.description >= 0 ? row[headerMap.description] ?? "" : "";
          const payeeRaw = headerMap.payee >= 0 ? row[headerMap.payee] ?? "" : "";
          const currencyRaw =
            headerMap.currency >= 0
              ? row[headerMap.currency] ?? DEFAULT_CURRENCY
              : rowAsObject["Währung"] || rowAsObject["Waehrung"] || DEFAULT_CURRENCY;

          const bookingDate = toIsoDateGerman(bookingRaw) ?? bookingRaw.trim();
          const valueDate = toIsoDateGerman(valueRaw);
          const amount = parseAmountGerman(amountRaw);
          if (amount === undefined) {
            throw new Error(`Betrag in Zeile ${index + 2} konnte nicht gelesen werden.`);
          }

          const description = (descriptionRaw || payeeRaw || "").trim() || "—";
          const payee = payeeRaw?.trim() || undefined;
          const currencyValue = (currencyRaw ?? DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY;

          const transaction: Transaction = {
            id: generateId(index),
            bookingDate,
            valueDate,
            description,
            payee,
            amount,
            currency: currencyValue,
            category: categorise({ description, payee, amount }),
            raw: rowAsObject,
          };

          return transaction;
        });

        handleParsedTransactions(newTransactions);
      } catch (error) {
        console.error(error);
        const message = error instanceof Error ? error.message : "Unbekannter Fehler beim Lesen der CSV.";
        alert(`CSV konnte nicht verarbeitet werden: ${message}`);
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    };
    reader.readAsText(file);
  };

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    handleFileList(event.target.files);
  };

  const balance = totals.income + totals.expense;

  return (
    <div className="app">
      <header className="app__header">
        <div>
          <h1>FinLedger</h1>
          <p className="app__tagline">Upload your bank CSV statements to analyse spending in seconds.</p>
        </div>
        <div className="app__header-actions">
          <button type="button" onClick={toggleTheme} className="button secondary">
            {theme === "dark" ? "Switch to light" : "Switch to dark"}
          </button>
          <button type="button" onClick={resetData} className="button danger">
            Clear data
          </button>
        </div>
      </header>

      <section className="panel">
        <div className="panel__content">
          <label className="file-upload">
            <span className="file-upload__label">Import transactions</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={onFileChange}
              className="file-upload__input"
            />
          </label>
          <div className="filters">
            <label className="filters__item">
              <span>Month</span>
              <select value={selectedMonth} onChange={event => setSelectedMonth(event.target.value)}>
                <option value="">All months</option>
                {months.map(month => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                ))}
              </select>
            </label>
            <label className="filters__item">
              <span>Search</span>
              <input
                type="search"
                placeholder="Find by description, payee or category"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
              />
            </label>
          </div>
        </div>
        <p className="panel__hint">
          Works best with CSV exports from German banks. The parser automatically detects delimiters and common column names.
        </p>
      </section>

      <section className="summary">
        <article className="summary__card">
          <span className="summary__label">Income</span>
          <span className="summary__value positive">{formatCurrency.format(totals.income)}</span>
        </article>
        <article className="summary__card">
          <span className="summary__label">Expenses</span>
          <span className="summary__value negative">{formatCurrency.format(Math.abs(totals.expense))}</span>
        </article>
        <article className="summary__card">
          <span className="summary__label">Balance</span>
          <span className={`summary__value ${balance >= 0 ? "positive" : "negative"}`}>
            {formatCurrency.format(balance)}
          </span>
        </article>
      </section>

      <section className="grid">
        <article className="panel transactions">
          <header className="panel__title">
            <h2>Transactions</h2>
            <span>{filteredTransactions.length} entries</span>
          </header>
          <div className="transactions__table-wrapper">
            <table className="transactions__table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th>Category</th>
                  <th className="align-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map(transaction => (
                  <tr key={transaction.id}>
                    <td>
                      <span className="transactions__date">{transaction.bookingDate}</span>
                      {transaction.valueDate && (
                        <span className="transactions__subtext">Value {transaction.valueDate}</span>
                      )}
                    </td>
                    <td>
                      <span className="transactions__description">{transaction.description}</span>
                      {transaction.payee && (
                        <span className="transactions__subtext">{transaction.payee}</span>
                      )}
                    </td>
                    <td>{transaction.category}</td>
                    <td className={`align-right ${transaction.amount >= 0 ? "positive" : "negative"}`}>
                      {formatterFor(transaction.currency || currency).format(transaction.amount)}
                    </td>
                  </tr>
                ))}
                {filteredTransactions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="empty">
                      No transactions found. Try importing a CSV file or adjusting the filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="panel categories">
          <header className="panel__title">
            <h2>Spending by category</h2>
            <span>{categoryTotals.length || "0"} categories</span>
          </header>
          {categoryTotals.length === 0 ? (
            <p className="empty">No data to display yet.</p>
          ) : (
            <ul className="categories__list">
              {categoryTotals.map(category => {
                const share = totalExpensesForShare > 0 ? (category.expense / totalExpensesForShare) * 100 : 0;
                return (
                  <li key={category.category} className="categories__item">
                    <div className="categories__meta">
                      <span className="categories__name">{category.category}</span>
                      <span className="categories__amount negative">
                        {category.expense > 0 ? formatCurrency.format(category.expense * -1) : formatCurrency.format(0)}
                      </span>
                    </div>
                    <div className="categories__bar" aria-hidden>
                      <span
                        className="categories__bar-fill"
                        style={{ width: `${share > 0 ? Math.max(6, share) : 0}%` }}
                      />
                    </div>
                    {category.income > 0 && (
                      <div className="categories__income">Income: {formatCurrency.format(category.income)}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </article>
      </section>

      <section className="panel help">
        <h2>Need a sample CSV?</h2>
        <p>
          Create a spreadsheet with the columns <strong>Buchungstag</strong>, <strong>Beschreibung</strong>,{' '}
          <strong>Beguenstigter/Zahlungspflichtiger</strong> and <strong>Betrag</strong>. Use the German format
          <code>31.12.2024</code> for dates and commas as decimal separators (e.g. <code>-10,50</code> for expenses).
          Export it as CSV and import it above.
        </p>
      </section>
    </div>
  );
}
