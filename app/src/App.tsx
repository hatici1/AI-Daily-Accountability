import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";

type CategorySource = "bank" | "detected";

type Transaction = {
  id: string;
  bookingDate: string;
  valueDate?: string;
  description: string;
  payee?: string;
  amount: number;
  currency: string;
  category: string;
  detectedCategory: string;
  categorySource: CategorySource;
  bankCategory?: string;
  account?: string;
  info?: string;
  iban?: string;
  bic?: string;
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
  account: number;
  info: number;
  iban: number;
  bic: number;
  bankCategory: number;
};

const STORAGE_KEY = "finance-app/transactions";
const THEME_KEY = "finance-app/theme";
const DEFAULT_CURRENCY = "EUR";

const GERMAN_HEADERS: Record<keyof HeaderMap, string[]> = {
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
  account: ["Auftragskonto", "Account", "Konto"],
  info: ["Info", "Notiz", "Hinweis"],
  iban: ["Kontonummer/IBAN", "IBAN", "Kontonummer"],
  bic: ["BIC (SWIFT-Code)", "BIC", "SWIFT", "SWIFT-Code"],
  bankCategory: ["Kategorie", "Kategorie der Bank", "Category"],
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
    account: resolveIndex(GERMAN_HEADERS.account),
    info: resolveIndex(GERMAN_HEADERS.info),
    iban: resolveIndex(GERMAN_HEADERS.iban),
    bic: resolveIndex(GERMAN_HEADERS.bic),
    bankCategory: resolveIndex(GERMAN_HEADERS.bankCategory),
  };
}

function parseTransactionsFromCsvText(rawText: string): Transaction[] {
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
    throw new Error("Konnte Buchungsdatum oder Betrag in der Kopfzeile nicht finden. Bitte prüfen Sie die CSV-Datei.");
  }

  return rows.slice(1).map((row, index) => {
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
    const accountRaw = headerMap.account >= 0 ? row[headerMap.account] ?? "" : "";
    const infoRaw = headerMap.info >= 0 ? row[headerMap.info] ?? "" : "";
    const ibanRaw = headerMap.iban >= 0 ? row[headerMap.iban] ?? "" : "";
    const bicRaw = headerMap.bic >= 0 ? row[headerMap.bic] ?? "" : "";
    const bankCategoryRaw = headerMap.bankCategory >= 0 ? row[headerMap.bankCategory] ?? "" : "";

    const bookingDate = toIsoDateGerman(bookingRaw) ?? bookingRaw.trim();
    const valueDate = toIsoDateGerman(valueRaw) ?? (valueRaw.trim() ? valueRaw.trim() : undefined);
    const amount = parseAmountGerman(amountRaw);
    if (amount === undefined) {
      throw new Error(`Betrag in Zeile ${index + 2} konnte nicht gelesen werden.`);
    }

    const description = (descriptionRaw || payeeRaw || infoRaw || "").trim() || "—";
    const payee = payeeRaw?.trim() || undefined;
    const currencyValue = (currencyRaw ?? DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY;
    const bankCategory = bankCategoryRaw.trim() || undefined;
    const info = infoRaw.trim();
    const account = accountRaw.trim();
    const iban = ibanRaw.replace(/\s+/g, "").trim();
    const bic = bicRaw.trim();
    const detectedCategory = categorise({ description, payee, amount });
    const finalCategory = bankCategory ?? detectedCategory;
    const categorySource: CategorySource = bankCategory ? "bank" : "detected";

    return {
      id: generateId(index),
      bookingDate,
      valueDate,
      description,
      payee,
      amount,
      currency: currencyValue,
      category: finalCategory,
      detectedCategory,
      categorySource,
      bankCategory,
      account: account && account !== description ? account : undefined,
      info: info && info !== description ? info : undefined,
      iban: iban || undefined,
      bic: bic || undefined,
      raw: rowAsObject,
    };
  });
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

function extractMonth(value: string): string {
  if (!value) return "";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}/.test(trimmed)) {
    return trimmed.slice(0, 7);
  }
  const iso = toIsoDateGerman(trimmed);
  if (iso) {
    return iso.slice(0, 7);
  }
  return trimmed.slice(0, 7);
}

function formatDisplayDate(value: string): string {
  if (!value) return "—";
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString();
    }
  }
  const normalised = toIsoDateGerman(trimmed);
  if (normalised) {
    const date = new Date(`${normalised}T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString();
    }
  }
  return trimmed;
}

function formatIbanForDisplay(iban?: string): string | undefined {
  if (!iban) return undefined;
  const compact = iban.replace(/\s+/g, "");
  if (!compact) return undefined;
  return compact.replace(/(.{4})/g, "$1 ").trim();
}

function formatMonthLabel(month: string): string {
  if (/^\d{4}-\d{2}$/.test(month)) {
    const date = new Date(`${month}-01T00:00:00`);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString(undefined, { year: "numeric", month: "short" });
    }
  }
  return month;
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

function normaliseStoredTransactions(value: string | null): Transaction[] {
  const parsed = safeJsonParse<unknown>(value, []);
  if (!Array.isArray(parsed)) return [];

  return parsed.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Partial<Transaction> & { [key: string]: unknown };

    const descriptionRaw = typeof record.description === "string" ? record.description : "";
    const payeeRaw = typeof record.payee === "string" ? record.payee : undefined;
    const amountNumber =
      typeof record.amount === "number"
        ? record.amount
        : typeof record.amount === "string"
        ? Number(record.amount)
        : 0;
    const currency = typeof record.currency === "string" && record.currency.trim() ? record.currency.trim() : DEFAULT_CURRENCY;
    const bookingRaw = typeof record.bookingDate === "string" ? record.bookingDate : String(record.bookingDate ?? "");
    const bookingDate = toIsoDateGerman(bookingRaw) ?? bookingRaw;
    const valueRaw = typeof record.valueDate === "string" ? record.valueDate : String(record.valueDate ?? "");
    const valueDate = toIsoDateGerman(valueRaw) ?? (valueRaw.trim() ? valueRaw.trim() : undefined);
    const bankCategory = typeof record.bankCategory === "string" && record.bankCategory.trim() ? record.bankCategory.trim() : undefined;
    const storedCategory = typeof record.category === "string" && record.category.trim() ? record.category.trim() : undefined;
    const detectedCategoryStored =
      typeof record.detectedCategory === "string" && record.detectedCategory.trim()
        ? record.detectedCategory.trim()
        : undefined;
    const detectedCategory =
      detectedCategoryStored ?? categorise({ description: descriptionRaw || "—", payee: payeeRaw, amount: amountNumber });
    const finalCategory = storedCategory ?? bankCategory ?? detectedCategory;
    const storedSource =
      record.categorySource === "bank" || record.categorySource === "detected"
        ? record.categorySource
        : undefined;
    const categorySource: CategorySource = storedSource ?? (bankCategory ? "bank" : "detected");
    const accountRaw = typeof record.account === "string" ? record.account : undefined;
    const infoRaw = typeof record.info === "string" ? record.info : undefined;
    const ibanRaw = typeof record.iban === "string" ? record.iban : undefined;
    const bicRaw = typeof record.bic === "string" ? record.bic : undefined;
    const description = (descriptionRaw || "—").trim() || "—";
    const account = accountRaw && accountRaw.trim() && accountRaw.trim() !== description ? accountRaw.trim() : undefined;
    const info = infoRaw && infoRaw.trim() && infoRaw.trim() !== description ? infoRaw.trim() : undefined;
    const ibanClean = ibanRaw ? ibanRaw.replace(/\s+/g, "").trim() : "";
    const iban = ibanClean || undefined;
    const bic = bicRaw && bicRaw.trim() ? bicRaw.trim() : undefined;

    const raw: Record<string, string | undefined> = {};
    if (record.raw && typeof record.raw === "object") {
      Object.entries(record.raw).forEach(([key, rawValue]) => {
        if (typeof rawValue === "string") {
          raw[key] = rawValue;
        } else if (rawValue != null) {
          raw[key] = String(rawValue);
        } else {
          raw[key] = undefined;
        }
      });
    }

    return [
      {
        id: typeof record.id === "string" && record.id ? record.id : generateId(index),
        bookingDate,
        valueDate,
        description,
        payee: payeeRaw && payeeRaw.trim() ? payeeRaw.trim() : undefined,
        amount: amountNumber,
        currency,
        category: finalCategory,
        detectedCategory,
        categorySource,
        bankCategory,
        account,
        info,
        iban,
        bic,
        raw,
      },
    ];
  });
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
    normaliseStoredTransactions(localStorage.getItem(STORAGE_KEY)),
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
      const monthKey = extractMonth(tx.bookingDate);
      if (monthKey) {
        monthSet.add(monthKey);
      }
    });
    return Array.from(monthSet).sort().reverse();
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return transactions.filter(tx => {
      const matchesMonth = !selectedMonth || extractMonth(tx.bookingDate) === selectedMonth;
      const haystack = [
        tx.description,
        tx.payee ?? "",
        tx.category,
        tx.bankCategory ?? "",
        tx.detectedCategory,
        tx.info ?? "",
        tx.account ?? "",
        tx.iban ?? "",
        tx.bic ?? "",
      ]
        .join(" ")
        .toLowerCase();
      const matchesQuery = query.length === 0 || haystack.includes(query);
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

  const payeeTotals = useMemo(() => {
    const aggregator = new Map<
      string,
      { label: string; total: number; count: number; categories: Set<string> }
    >();

    filteredTransactions.forEach(tx => {
      if (tx.amount >= 0) return;
      const label = (tx.payee && tx.payee.trim()) || tx.description;
      if (!label) return;
      const key = label.toLowerCase();
      const entry =
        aggregator.get(key) ?? { label, total: 0, count: 0, categories: new Set<string>() };
      entry.total += Math.abs(tx.amount);
      entry.count += 1;
      entry.categories.add(tx.category || "Other");
      aggregator.set(key, entry);
    });

    return Array.from(aggregator.values())
      .map(entry => ({
        label: entry.label,
        total: entry.total,
        count: entry.count,
        categories: Array.from(entry.categories).sort((a, b) => a.localeCompare(b)),
      }))
      .sort((a, b) => b.total - a.total);
  }, [filteredTransactions]);

  const topPayees = useMemo(() => payeeTotals.slice(0, 5), [payeeTotals]);

  const largestExpenses = useMemo(
    () =>
      filteredTransactions
        .filter(tx => tx.amount < 0)
        .sort((a, b) => a.amount - b.amount)
        .slice(0, 5),
    [filteredTransactions],
  );

  const recurringExpenses = useMemo(() => {
    const aggregator = new Map<
      string,
      {
        label: string;
        total: number;
        count: number;
        months: Set<string>;
        categories: Set<string>;
      }
    >();

    filteredTransactions.forEach(tx => {
      if (tx.amount >= 0) return;
      const label = (tx.payee && tx.payee.trim()) || tx.description;
      if (!label) return;
      const key = label.toLowerCase();
      const entry =
        aggregator.get(key) ?? {
          label,
          total: 0,
          count: 0,
          months: new Set<string>(),
          categories: new Set<string>(),
        };
      entry.total += Math.abs(tx.amount);
      entry.count += 1;
      entry.months.add(extractMonth(tx.bookingDate) || tx.bookingDate.slice(0, 7));
      entry.categories.add(tx.category || "Other");
      aggregator.set(key, entry);
    });

    return Array.from(aggregator.values())
      .filter(entry => entry.count >= 3 || entry.months.size >= 3)
      .map(entry => ({
        label: entry.label,
        total: entry.total,
        count: entry.count,
        months: entry.months.size,
        categories: Array.from(entry.categories).sort((a, b) => a.localeCompare(b)),
        average: entry.total / entry.count,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [filteredTransactions]);

  const monthlyBreakdown = useMemo(() => {
    const aggregator = new Map<string, { income: number; expense: number }>();

    filteredTransactions.forEach(tx => {
      const monthKey = extractMonth(tx.bookingDate) || "Unknown";
      const entry = aggregator.get(monthKey) ?? { income: 0, expense: 0 };
      if (tx.amount >= 0) {
        entry.income += tx.amount;
      } else {
        entry.expense += Math.abs(tx.amount);
      }
      aggregator.set(monthKey, entry);
    });

    return Array.from(aggregator.entries())
      .map(([month, value]) => ({
        month,
        income: value.income,
        expense: value.expense,
        net: value.income - value.expense,
      }))
      .sort((a, b) => b.month.localeCompare(a.month));
  }, [filteredTransactions]);

  const insightSuggestions = useMemo(() => {
    const suggestions: string[] = [];

    if (categoryTotals.length > 0 && totalExpensesForShare > 0) {
      const biggest = categoryTotals[0];
      const share = (biggest.expense / totalExpensesForShare) * 100;
      suggestions.push(
        `Die Kategorie ${biggest.category} macht ${share.toFixed(1)}% Ihrer Ausgaben aus (${formatCurrency.format(
          biggest.expense * -1,
        )}). Prüfen Sie hier Einsparpotenziale.`,
      );
    }

    if (recurringExpenses.length > 0) {
      const recurring = recurringExpenses[0];
      suggestions.push(
        `${recurring.label} taucht ${recurring.count}× auf und kostet insgesamt ${formatCurrency.format(
          -recurring.total,
        )}. Lohnt sich eine Kündigung oder ein günstigeres Angebot?`,
      );
    }

    if (topPayees.length > 0) {
      const payee = topPayees[0];
      suggestions.push(
        `Der größte Einzelanbieter ist ${payee.label} mit ${formatCurrency.format(
          -payee.total,
        )}. Vielleicht gibt es Alternativen oder günstigere Optionen.`,
      );
    } else if (largestExpenses.length > 0) {
      const expense = largestExpenses[0];
      suggestions.push(
        `Ihre größte Ausgabe ist ${expense.description} (${formatCurrency.format(
          expense.amount,
        )}). Überprüfen Sie, ob diese Zahlung notwendig ist.`,
      );
    }

    return suggestions.slice(0, 3);
  }, [categoryTotals, totalExpensesForShare, formatCurrency, recurringExpenses, topPayees, largestExpenses]);

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
        const newTransactions = parseTransactionsFromCsvText(rawText);
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

  const importSampleData = async () => {
    try {
      const response = await fetch("sample-transactions.csv", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const text = await response.text();
      const sampleTransactions = parseTransactionsFromCsvText(text);
      handleParsedTransactions(sampleTransactions);
    } catch (error) {
      console.error(error);
      const message =
        error instanceof Error
          ? error.message
          : "Unbekannter Fehler beim Laden der Beispieldaten.";
      alert(`Beispieldaten konnten nicht geladen werden: ${message}`);
    }
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
          <div className="import-actions">
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
            <button type="button" className="button tertiary" onClick={importSampleData}>
              Load sample data
            </button>
          </div>
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
          Need a quick demo? Load the bundled sample dataset.
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
                  <th>Details</th>
                  <th>Category</th>
                  <th className="align-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map(transaction => (
                  <tr key={transaction.id}>
                    <td>
                      <span className="transactions__date">{formatDisplayDate(transaction.bookingDate)}</span>
                      {transaction.valueDate && (
                        <span className="transactions__subtext">Valuta {formatDisplayDate(transaction.valueDate)}</span>
                      )}
                    </td>
                    <td>
                      <span className="transactions__description">{transaction.description}</span>
                      {transaction.payee && (
                        <span className="transactions__subtext">Payee: {transaction.payee}</span>
                      )}
                      {transaction.info && (
                        <span className="transactions__subtext">Info: {transaction.info}</span>
                      )}
                      {transaction.account && (
                        <span className="transactions__subtext">Account: {transaction.account}</span>
                      )}
                      {transaction.iban && (
                        <span className="transactions__subtext">
                          IBAN: {formatIbanForDisplay(transaction.iban)}
                        </span>
                      )}
                      {transaction.bic && (
                        <span className="transactions__subtext">BIC: {transaction.bic}</span>
                      )}
                    </td>
                    <td>
                      <span className="transactions__category">{transaction.category}</span>
                      {transaction.categorySource === "detected" && transaction.bankCategory && (
                        <span className="transactions__subtext">Bank: {transaction.bankCategory}</span>
                      )}
                      {transaction.categorySource === "bank" &&
                        transaction.detectedCategory &&
                        transaction.detectedCategory !== transaction.category && (
                          <span className="transactions__subtext">
                            Vorschlag: {transaction.detectedCategory}
                          </span>
                        )}
                    </td>
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

      <section className="grid grid--balanced">
        <article className="panel insight">
          <header className="panel__title">
            <h2>Top payees to review</h2>
            <span>{topPayees.length || "0"} payees</span>
          </header>
          {topPayees.length === 0 ? (
            <p className="empty">No major spenders detected in the current view.</p>
          ) : (
            <ul className="insight-list">
              {topPayees.map(payee => (
                <li key={payee.label} className="insight-list__item">
                  <div className="insight-list__row">
                    <span className="insight-list__primary">{payee.label}</span>
                    <span className="insight-list__value negative">
                      {formatCurrency.format(-payee.total)}
                    </span>
                  </div>
                  <div className="insight-list__meta">
                    <span>
                      {payee.count} {payee.count === 1 ? "transaction" : "transactions"}
                    </span>
                    {payee.categories.length > 0 && (
                      <span>Categories: {payee.categories.join(", ")}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel insight">
          <header className="panel__title">
            <h2>Recurring expenses</h2>
            <span>{recurringExpenses.length || "0"} patterns</span>
          </header>
          {recurringExpenses.length === 0 ? (
            <p className="empty">No recurring expenses detected yet.</p>
          ) : (
            <ul className="insight-list">
              {recurringExpenses.map(item => (
                <li key={item.label} className="insight-list__item">
                  <div className="insight-list__row">
                    <span className="insight-list__primary">{item.label}</span>
                    <span className="insight-list__value negative">
                      {formatCurrency.format(-item.total)}
                    </span>
                  </div>
                  <div className="insight-list__meta">
                    <span>
                      {item.count} Zahlungen · {item.months} Monate
                    </span>
                    {item.categories.length > 0 && (
                      <span>Kategorien: {item.categories.join(", ")}</span>
                    )}
                  </div>
                  <div className="insight-list__meta">
                    <span>Ø {formatCurrency.format(-item.average)} pro Buchung</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>
      </section>

      <section className="grid grid--balanced">
        <article className="panel insight">
          <header className="panel__title">
            <h2>Biggest expenses</h2>
            <span>{largestExpenses.length || "0"} entries</span>
          </header>
          {largestExpenses.length === 0 ? (
            <p className="empty">No expenses in the filtered data.</p>
          ) : (
            <ul className="insight-list">
              {largestExpenses.map(expense => (
                <li key={expense.id} className="insight-list__item">
                  <div className="insight-list__row">
                    <span className="insight-list__primary">
                      {formatDisplayDate(expense.bookingDate)} · {expense.description}
                    </span>
                    <span className="insight-list__value negative">
                      {formatterFor(expense.currency || currency).format(expense.amount)}
                    </span>
                  </div>
                  <div className="insight-list__meta">
                    <span>{expense.category}</span>
                    {expense.payee && <span>{expense.payee}</span>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel insight">
          <header className="panel__title">
            <h2>Monthly overview</h2>
            <span>{monthlyBreakdown.length || "0"} months</span>
          </header>
          {monthlyBreakdown.length === 0 ? (
            <p className="empty">Import data to see monthly trends.</p>
          ) : (
            <div className="monthly-table-wrapper">
              <table className="monthly-table">
                <thead>
                  <tr>
                    <th>Month</th>
                    <th>Income</th>
                    <th>Expenses</th>
                    <th>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyBreakdown.map(month => (
                    <tr key={month.month}>
                      <td>{formatMonthLabel(month.month)}</td>
                      <td>{formatCurrency.format(month.income)}</td>
                      <td className="negative">{formatCurrency.format(-month.expense)}</td>
                      <td className={month.net >= 0 ? "positive align-right" : "negative align-right"}>
                        {formatCurrency.format(month.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </article>
      </section>

      <section className="panel insight">
        <header className="panel__title">
          <h2>Insights &amp; next steps</h2>
        </header>
        {insightSuggestions.length === 0 ? (
          <p className="empty">Import a CSV to unlock personalised savings ideas.</p>
        ) : (
          <ul className="insight-suggestions">
            {insightSuggestions.map((suggestion, index) => (
              <li key={index}>{suggestion}</li>
            ))}
          </ul>
        )}
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
