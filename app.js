"use strict";

/*
  Koccie Performance Overview

  Tabs:
  - Overview
  - Market
  - Product Type
  - Recipient
  - Combined

  Dependencies in index.html:
  - PapaParse
  - Chart.js
*/

const REPORT_SOURCES = {
  overview: {
    label: "Overview",
    csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSexO0zuj22HikxPvejxlLq1xc6OxgcMKavxvfcrZjUBo3DmzK20_pMVzINDWzUOSC_FZ6-sf10H3bN/pub?gid=1443953065&single=true&output=csv",
    type: "overview"
  },
  market: {
    label: "Market",
    csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSexO0zuj22HikxPvejxlLq1xc6OxgcMKavxvfcrZjUBo3DmzK20_pMVzINDWzUOSC_FZ6-sf10H3bN/pub?gid=1730682205&single=true&output=csv",
    type: "dimension",
    dimensionColumn: "Market",
    dimensionLabel: "Market",
    note: "Google Ads hiện chỉ chạy ở FR. BEL và SWIZ sẽ hiển thị ROAS GG là N/A nếu không có spend."
  },
  productType: {
    label: "Product Type",
    csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSexO0zuj22HikxPvejxlLq1xc6OxgcMKavxvfcrZjUBo3DmzK20_pMVzINDWzUOSC_FZ6-sf10H3bN/pub?gid=678518829&single=true&output=csv",
    type: "dimension",
    dimensionColumn: "Product Type",
    dimensionLabel: "Product Type",
    note: "So sánh performance theo từng nhóm sản phẩm."
  },
  recipient: {
    label: "Recipient",
    csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSexO0zuj22HikxPvejxlLq1xc6OxgcMKavxvfcrZjUBo3DmzK20_pMVzINDWzUOSC_FZ6-sf10H3bN/pub?gid=1190660551&single=true&output=csv",
    type: "dimension",
    dimensionColumn: "Recipient",
    dimensionLabel: "Recipient",
    note: "So sánh performance theo từng nhóm recipient."
  },
  combined: {
    label: "Combined",
    csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSexO0zuj22HikxPvejxlLq1xc6OxgcMKavxvfcrZjUBo3DmzK20_pMVzINDWzUOSC_FZ6-sf10H3bN/pub?gid=1256054668&single=true&output=csv",
    type: "combined",
    note: "Drill-down theo Market + Product Type + Recipient."
  }
};

const DATE_FORMAT_PREFERENCE = "MDY";
const DAILY_ROW_LIMIT = 500;
const COMBINED_TOP_LIMIT = 10;

const CORE_HEADERS_BY_REPORT = {
  overview: ["Date", "Total Orders", "Total Sales"],
  market: ["Date", "Market", "Total Orders", "Total Sales"],
  productType: ["Date", "Product Type", "Total Orders", "Total Sales"],
  recipient: ["Date", "Recipient", "Total Orders", "Total Sales"],
  combined: ["Date", "Market", "Product Type", "Recipient", "Total Orders", "Total Sales"]
};

const EXPECTED_HEADERS_BY_REPORT = {
  overview: [
    "Date",
    "Total Orders",
    "Total Sales",
    "FB Ads Spend",
    "Google Ads Spend",
    "Total Ads Spend",
    "ROAS",
    "Profit",
    "API Cost",
    "Fulfill Cost",
    "Fixed Cost"
  ],
  market: [
    "Date",
    "Market",
    "Total Orders",
    "Total Sales",
    "AOV",
    "Items Sold",
    "Total Ad spent",
    "ROAS",
    "FB Ad spent",
    "ROAS FB",
    "GG Ad spent",
    "ROAS GG"
  ],
  productType: [
    "Date",
    "Product Type",
    "Total Orders",
    "Total Sales",
    "AOV",
    "Items Sold",
    "Total Ad spent",
    "ROAS",
    "FB Ad spent",
    "ROAS FB",
    "GG Ad spent",
    "ROAS GG"
  ],
  recipient: [
    "Date",
    "Recipient",
    "Total Orders",
    "Total Sales",
    "AOV",
    "Items Sold",
    "Total Ad spent",
    "ROAS",
    "FB Ad spent",
    "ROAS FB",
    "GG Ad spent",
    "ROAS GG"
  ],
  combined: [
    "Date",
    "Market",
    "Product Type",
    "Recipient",
    "Total Orders",
    "Total Sales",
    "AOV",
    "Items Sold",
    "Total Ad spent",
    "ROAS",
    "FB Ad spent",
    "ROAS FB",
    "GG Ad spent",
    "ROAS GG"
  ]
};

const CHART_COLORS = [
  "rgba(53, 208, 255, 0.72)",
  "rgba(39, 233, 143, 0.72)",
  "rgba(255, 184, 77, 0.72)",
  "rgba(159, 124, 255, 0.72)",
  "rgba(255, 92, 122, 0.72)",
  "rgba(88, 166, 255, 0.72)",
  "rgba(255, 140, 66, 0.72)",
  "rgba(190, 242, 100, 0.72)"
];

let activeReport = "overview";
let reportData = {};
let reportLoaded = {};
let currentChart = null;
let reportCharts = {};
let filtersInitialized = false;
let tabsInitialized = false;
let overviewNodes = [];
let combinedFiltersInitialized = false;

Object.keys(REPORT_SOURCES).forEach(key => {
  reportData[key] = [];
  reportLoaded[key] = false;
});

function normalizeHeader(value) {
  return String(value || "")
    .replace(/\uFEFF/g, "")
    .replace(/\u00A0/g, " ")
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function setToneClass(id, value) {
  const element = document.getElementById(id);
  if (!element) return;

  element.classList.remove("positive", "negative");
  element.classList.add(Number(value) >= 0 ? "positive" : "negative");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setQueryParam(url, key, value) {
  try {
    const parsedUrl = new URL(url);
    parsedUrl.searchParams.set(key, value);
    return parsedUrl.toString();
  } catch (error) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
  }
}

function getResolvedCsvUrl(reportKey) {
  const source = REPORT_SOURCES[reportKey];
  const rawUrl = String(source && source.csvUrl ? source.csvUrl : "").trim();

  if (!rawUrl || rawUrl.startsWith("DAN_LINK_CSV")) return rawUrl;

  let resolvedUrl = rawUrl;

  if (/\/pubhtml/i.test(resolvedUrl)) {
    resolvedUrl = resolvedUrl.replace(/\/pubhtml/i, "/pub");
  }

  const isGoogleSheetUrl = /docs\.google\.com\/spreadsheets/i.test(resolvedUrl);
  const hasCsvOutput = /[?&]output=csv\b/i.test(resolvedUrl) || /[?&]format=csv\b/i.test(resolvedUrl);

  if (isGoogleSheetUrl && !hasCsvOutput) {
    resolvedUrl = setQueryParam(resolvedUrl, "output", "csv");
  }

  return resolvedUrl;
}

function cleanNumber(value) {
  if (value === undefined || value === null) return 0;

  const raw = String(value)
    .replace(/\u00A0/g, " ")
    .replace(/−/g, "-")
    .trim();

  if (raw === "" || raw === "-" || raw === "—") return 0;

  const negativeByParentheses = /^\(.*\)$/.test(raw);
  const cleaned = raw
    .replace(/[,$%\s]/g, "")
    .replace(/[()]/g, "")
    .replace(/[xX]/g, "")
    .replace(/[^0-9.-]/g, "")
    .trim();

  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;

  const number = Number(cleaned);
  if (Number.isNaN(number)) return 0;

  return negativeByParentheses ? -Math.abs(number) : number;
}

function formatMoney(value) {
  const number = Number(value) || 0;
  const absValue = Math.abs(number);
  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(absValue);

  return number < 0 ? `-$ ${formatted}` : `$ ${formatted}`;
}

function formatCompactMoney(value) {
  const number = Number(value) || 0;
  const absValue = Math.abs(number);
  const sign = number < 0 ? "-" : "";

  if (absValue >= 1000000) return `${sign}$ ${(absValue / 1000000).toFixed(1)}M`;
  if (absValue >= 1000) return `${sign}$ ${(absValue / 1000).toFixed(1)}K`;

  return `${sign}$ ${absValue.toFixed(0)}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Number(value) || 0);
}

function formatPercent(value) {
  return `% ${(Number(value) || 0).toFixed(1)}`;
}

function formatRoas(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "N/A";
  return `${(Number(value) || 0).toFixed(2)}x`;
}

function safeDivide(numerator, denominator) {
  const top = Number(numerator) || 0;
  const bottom = Number(denominator) || 0;
  return bottom === 0 ? 0 : top / bottom;
}

function safePercent(numerator, denominator) {
  return safeDivide(numerator, denominator) * 100;
}

function makeDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  const isValid = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  return isValid ? date : null;
}

function normalizeYear(year) {
  if (year < 100) return year >= 70 ? 1900 + year : 2000 + year;
  return year;
}

function parseDate(value) {
  if (!value) return null;

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serialNumber = Number(raw);
    if (serialNumber > 20000 && serialNumber < 80000) {
      const utcMilliseconds = Math.round((serialNumber - 25569) * 86400 * 1000);
      const utcDate = new Date(utcMilliseconds);
      return new Date(utcDate.getUTCFullYear(), utcDate.getUTCMonth(), utcDate.getUTCDate());
    }
  }

  const ymd = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (ymd) return makeDate(Number(ymd[1]), Number(ymd[2]), Number(ymd[3]));

  const slashDate = raw.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (slashDate) {
    const first = Number(slashDate[1]);
    const second = Number(slashDate[2]);
    const year = normalizeYear(Number(slashDate[3]));
    let month;
    let day;

    if (first > 12 && second <= 12) {
      day = first;
      month = second;
    } else if (second > 12 && first <= 12) {
      month = first;
      day = second;
    } else if (DATE_FORMAT_PREFERENCE === "DMY") {
      day = first;
      month = second;
    } else {
      month = first;
      day = second;
    }

    return makeDate(year, month, day);
  }

  const fallback = new Date(raw);
  if (!Number.isNaN(fallback.getTime())) {
    return new Date(fallback.getFullYear(), fallback.getMonth(), fallback.getDate());
  }

  return null;
}

function dateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getValue(row, possibleNames) {
  const keys = Object.keys(row);

  for (const name of possibleNames) {
    const normalizedName = normalizeHeader(name).toLowerCase();
    const matchedKey = keys.find(key => normalizeHeader(key).toLowerCase() === normalizedName);

    if (matchedKey !== undefined) return row[matchedKey];
  }

  return "";
}

function rowHasHeader(row, headerName) {
  const target = normalizeHeader(headerName).toLowerCase();
  return row.some(cell => normalizeHeader(cell).toLowerCase() === target);
}

function findHeaderIndex(rows, reportKey) {
  const coreHeaders = CORE_HEADERS_BY_REPORT[reportKey] || ["Date"];
  const candidates = rows
    .map((row, index) => ({ row, index }))
    .filter(item => normalizeHeader(item.row[0]).toLowerCase() === "date");

  if (!candidates.length) return -1;

  const strongCandidate = candidates.find(item => coreHeaders.every(header => rowHasHeader(item.row, header)));
  return strongCandidate ? strongCandidate.index : candidates[0].index;
}

function getMissingHeaders(headers, expectedHeaders) {
  const normalizedHeaders = new Set(headers.map(header => normalizeHeader(header).toLowerCase()));
  return expectedHeaders.filter(header => !normalizedHeaders.has(normalizeHeader(header).toLowerCase()));
}

function rowsToObjects(rows, headerIndex) {
  const headers = rows[headerIndex].map(header => normalizeHeader(header));
  const dataRows = rows.slice(headerIndex + 1);

  const objects = dataRows.map((row, rowOffset) => {
    const obj = { __rowNumber: headerIndex + 2 + rowOffset };

    headers.forEach((header, index) => {
      if (header) obj[header] = row[index] ?? "";
    });

    return obj;
  });

  return { headers, objects };
}

function normalizeOverviewRow(row) {
  const rawDateText = String(getValue(row, ["Date"]) || "").trim();
  const dateObj = parseDate(rawDateText);
  const dateText = dateObj ? toInputDate(dateObj) : rawDateText;

  const totalOrders = cleanNumber(getValue(row, ["Total Orders"]));
  const totalSales = cleanNumber(getValue(row, ["Total Sales"]));
  const fbAdsSpend = cleanNumber(getValue(row, ["FB Ads Spend", "FB Ad spent"]));
  const googleAdsSpend = cleanNumber(getValue(row, ["Google Ads Spend", "GG Ad spent", "GG Ads Spend"]));

  const totalAdsRaw = getValue(row, ["Total Ads Spend", "Total Ad spent"]);
  let totalAdsSpend = cleanNumber(totalAdsRaw);

  if ((totalAdsRaw === "" || totalAdsSpend === 0) && (fbAdsSpend || googleAdsSpend)) {
    totalAdsSpend = fbAdsSpend + googleAdsSpend;
  }

  let roas = cleanNumber(getValue(row, ["ROAS"]));
  if (roas === 0 && totalAdsSpend > 0) roas = totalSales / totalAdsSpend;

  const profit = cleanNumber(getValue(row, ["Profit", "Net Profit"]));
  const apiCost = cleanNumber(getValue(row, ["API Cost"]));
  const fulfillCost = cleanNumber(getValue(row, ["Fulfill Cost"]));
  const fixedCost = cleanNumber(getValue(row, ["Fixed Cost"]));

  return {
    rawDateText,
    dateText,
    dateObj,
    totalOrders,
    totalSales,
    fbAdsSpend,
    googleAdsSpend,
    totalAdsSpend,
    roas,
    profit,
    apiCost,
    fulfillCost,
    fixedCost
  };
}

function normalizeReportRow(row, reportKey) {
  const source = REPORT_SOURCES[reportKey];
  const rawDateText = String(getValue(row, ["Date"]) || "").trim();
  const dateObj = parseDate(rawDateText);
  const dateText = dateObj ? toInputDate(dateObj) : rawDateText;

  const market = normalizeHeader(getValue(row, ["Market"])).toUpperCase();
  const productType = normalizeHeader(getValue(row, ["Product Type"]));
  const recipient = normalizeHeader(getValue(row, ["Recipient"]));
  const dimensionValue = source.type === "dimension"
    ? normalizeHeader(getValue(row, [source.dimensionColumn]))
    : "";

  const totalOrders = cleanNumber(getValue(row, ["Total Orders"]));
  const totalSales = cleanNumber(getValue(row, ["Total Sales"]));
  const aovRaw = cleanNumber(getValue(row, ["AOV"]));
  const itemsSold = cleanNumber(getValue(row, ["Items Sold"]));
  const totalAdsSpend = cleanNumber(getValue(row, ["Total Ad spent", "Total Ads Spend", "Total Ads spent"]));
  const fbAdsSpend = cleanNumber(getValue(row, ["FB Ad spent", "FB Ads Spend", "FB Ads spent"]));
  const ggAdsSpend = cleanNumber(getValue(row, ["GG Ad spent", "Google Ads Spend", "GG Ads Spend"]));

  return {
    rawDateText,
    dateText,
    dateObj,
    reportKey,
    dimensionValue,
    market,
    productType,
    recipient,
    totalOrders,
    totalSales,
    aov: aovRaw || safeDivide(totalSales, totalOrders),
    itemsSold,
    totalAdsSpend,
    fbAdsSpend,
    ggAdsSpend,
    roas: totalAdsSpend > 0 ? totalSales / totalAdsSpend : 0,
    roasFb: fbAdsSpend > 0 ? totalSales / fbAdsSpend : 0,
    roasGg: ggAdsSpend > 0 ? totalSales / ggAdsSpend : null
  };
}

function isValidDataRow(row) {
  const dateLower = normalizeHeader(row.rawDateText || row.dateText).toLowerCase();

  if (!dateLower) return false;
  if (dateLower === "date") return false;
  if (dateLower === "total") return false;
  if (dateLower.startsWith("total ")) return false;
  if (dateLower.includes("daily overview")) return false;
  if (!row.dateObj) return false;

  return true;
}

function isValidReportRow(row, reportKey) {
  if (!isValidDataRow(row)) return false;

  const source = REPORT_SOURCES[reportKey];

  if (source.type === "dimension") {
    if (!row.dimensionValue) return false;
    if (normalizeHeader(row.dimensionValue).toLowerCase() === normalizeHeader(source.dimensionColumn).toLowerCase()) return false;
  }

  if (source.type === "combined") {
    if (!row.market && !row.productType && !row.recipient) return false;
  }

  return true;
}

function getLatestDate(data) {
  const dates = data
    .map(row => row.dateObj)
    .filter(Boolean)
    .map(dateOnly)
    .sort((a, b) => b - a);

  return dates[0] || null;
}

function calculateOverviewTotals(data) {
  return data.reduce((totals, row) => {
    totals.totalOrders += row.totalOrders;
    totals.totalSales += row.totalSales;
    totals.fbAdsSpend += row.fbAdsSpend;
    totals.googleAdsSpend += row.googleAdsSpend;
    totals.totalAdsSpend += row.totalAdsSpend;
    totals.profit += row.profit;
    totals.apiCost += row.apiCost;
    totals.fulfillCost += row.fulfillCost;
    totals.fixedCost += row.fixedCost;
    return totals;
  }, {
    totalOrders: 0,
    totalSales: 0,
    fbAdsSpend: 0,
    googleAdsSpend: 0,
    totalAdsSpend: 0,
    profit: 0,
    apiCost: 0,
    fulfillCost: 0,
    fixedCost: 0
  });
}

function calculatePerformanceTotals(rows) {
  const totals = rows.reduce((acc, row) => {
    acc.totalOrders += row.totalOrders;
    acc.totalSales += row.totalSales;
    acc.itemsSold += row.itemsSold;
    acc.totalAdsSpend += row.totalAdsSpend;
    acc.fbAdsSpend += row.fbAdsSpend;
    acc.ggAdsSpend += row.ggAdsSpend;
    return acc;
  }, {
    totalOrders: 0,
    totalSales: 0,
    itemsSold: 0,
    totalAdsSpend: 0,
    fbAdsSpend: 0,
    ggAdsSpend: 0,
    aov: 0,
    roas: 0,
    roasFb: 0,
    roasGg: null
  });

  totals.aov = safeDivide(totals.totalSales, totals.totalOrders);
  totals.roas = safeDivide(totals.totalSales, totals.totalAdsSpend);
  totals.roasFb = safeDivide(totals.totalSales, totals.fbAdsSpend);
  totals.roasGg = totals.ggAdsSpend > 0 ? totals.totalSales / totals.ggAdsSpend : null;

  return totals;
}

function aggregateByDimension(data) {
  const map = {};

  data.forEach(row => {
    const key = row.dimensionValue || "UNKNOWN";

    if (!map[key]) {
      map[key] = {
        label: key,
        totalOrders: 0,
        totalSales: 0,
        itemsSold: 0,
        totalAdsSpend: 0,
        fbAdsSpend: 0,
        ggAdsSpend: 0,
        aov: 0,
        roas: 0,
        roasFb: 0,
        roasGg: null
      };
    }

    map[key].totalOrders += row.totalOrders;
    map[key].totalSales += row.totalSales;
    map[key].itemsSold += row.itemsSold;
    map[key].totalAdsSpend += row.totalAdsSpend;
    map[key].fbAdsSpend += row.fbAdsSpend;
    map[key].ggAdsSpend += row.ggAdsSpend;
  });

  return Object.values(map)
    .map(item => {
      item.aov = safeDivide(item.totalSales, item.totalOrders);
      item.roas = safeDivide(item.totalSales, item.totalAdsSpend);
      item.roasFb = safeDivide(item.totalSales, item.fbAdsSpend);
      item.roasGg = item.ggAdsSpend > 0 ? item.totalSales / item.ggAdsSpend : null;
      return item;
    })
    .sort((a, b) => b.totalSales - a.totalSales);
}

function makeCombinationLabel(row) {
  return [row.market || "-", row.productType || "-", row.recipient || "-"].join(" | ");
}

function aggregateCombined(data) {
  const map = {};

  data.forEach(row => {
    const key = makeCombinationLabel(row);

    if (!map[key]) {
      map[key] = {
        label: key,
        market: row.market || "-",
        productType: row.productType || "-",
        recipient: row.recipient || "-",
        totalOrders: 0,
        totalSales: 0,
        itemsSold: 0,
        totalAdsSpend: 0,
        fbAdsSpend: 0,
        ggAdsSpend: 0,
        aov: 0,
        roas: 0,
        roasFb: 0,
        roasGg: null
      };
    }

    map[key].totalOrders += row.totalOrders;
    map[key].totalSales += row.totalSales;
    map[key].itemsSold += row.itemsSold;
    map[key].totalAdsSpend += row.totalAdsSpend;
    map[key].fbAdsSpend += row.fbAdsSpend;
    map[key].ggAdsSpend += row.ggAdsSpend;
  });

  return Object.values(map)
    .map(item => {
      item.aov = safeDivide(item.totalSales, item.totalOrders);
      item.roas = safeDivide(item.totalSales, item.totalAdsSpend);
      item.roasFb = safeDivide(item.totalSales, item.fbAdsSpend);
      item.roasGg = item.ggAdsSpend > 0 ? item.totalSales / item.ggAdsSpend : null;
      return item;
    })
    .sort((a, b) => b.totalSales - a.totalSales);
}

function updateOverviewKPIs(data) {
  const totals = calculateOverviewTotals(data);
  const aov = safeDivide(totals.totalSales, totals.totalOrders);
  const roas = safeDivide(totals.totalSales, totals.totalAdsSpend);

  setText("totalOrders", formatNumber(totals.totalOrders));
  setText("totalSales", formatMoney(totals.totalSales));
  setText("aov", formatMoney(aov));
  setText("roas", formatRoas(roas));
  setText("netProfit", formatMoney(totals.profit));
  setToneClass("netProfit", totals.profit);

  setText("totalAdsSpend", formatMoney(totals.totalAdsSpend));
  setText("totalAdsSpendPct", formatPercent(safePercent(totals.totalAdsSpend, totals.totalSales)));
  setText("fbAdsSpend", formatMoney(totals.fbAdsSpend));
  setText("fbAdsSpendPct", formatPercent(safePercent(totals.fbAdsSpend, totals.totalAdsSpend)));
  setText("googleAdsSpend", formatMoney(totals.googleAdsSpend));
  setText("googleAdsSpendPct", formatPercent(safePercent(totals.googleAdsSpend, totals.totalAdsSpend)));
  setText("apiCost", formatMoney(totals.apiCost));
  setText("apiCostPct", formatPercent(safePercent(totals.apiCost, totals.totalSales)));
  setText("fulfillCost", formatMoney(totals.fulfillCost));
  setText("fulfillCostPct", formatPercent(safePercent(totals.fulfillCost, totals.totalSales)));
}

function getLineChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 100,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "top",
        labels: { color: "#d9ecff", usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 16 }
      },
      tooltip: {
        backgroundColor: "#08111f",
        borderColor: "#244b7c",
        borderWidth: 1,
        titleColor: "#ffffff",
        bodyColor: "#d9ecff",
        callbacks: {
          label: context => `${context.dataset.label}: ${formatMoney(context.parsed.y)}`
        }
      }
    },
    scales: {
      x: {
        ticks: { color: "#7fa7d9", autoSkip: true, maxTicksLimit: 10, maxRotation: 0, minRotation: 0 },
        grid: { color: "rgba(20, 41, 69, 0.8)" }
      },
      y: {
        beginAtZero: false,
        ticks: { color: "#7fa7d9", maxTicksLimit: 8, callback: value => formatCompactMoney(value) },
        grid: { color: "rgba(20, 41, 69, 0.8)" }
      }
    }
  };
}

function getBarMoneyOptions(stacked) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 100,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: {
        position: "top",
        labels: { color: "#d9ecff", usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 12 }
      },
      tooltip: {
        backgroundColor: "#08111f",
        borderColor: "#244b7c",
        borderWidth: 1,
        titleColor: "#ffffff",
        bodyColor: "#d9ecff",
        callbacks: {
          label: context => `${context.dataset.label}: ${formatMoney(context.parsed.y)}`
        }
      }
    },
    scales: {
      x: {
        stacked: Boolean(stacked),
        ticks: { color: "#7fa7d9", autoSkip: true, maxTicksLimit: 8, maxRotation: 0, minRotation: 0 },
        grid: { color: "rgba(20, 41, 69, 0.8)" }
      },
      y: {
        stacked: Boolean(stacked),
        beginAtZero: true,
        ticks: { color: "#7fa7d9", callback: value => formatCompactMoney(value) },
        grid: { color: "rgba(20, 41, 69, 0.8)" }
      }
    }
  };
}

function getBarNumberOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 100,
    plugins: {
      legend: {
        position: "top",
        labels: { color: "#d9ecff", usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 12 }
      },
      tooltip: {
        backgroundColor: "#08111f",
        borderColor: "#244b7c",
        borderWidth: 1,
        titleColor: "#ffffff",
        bodyColor: "#d9ecff"
      }
    },
    scales: {
      x: {
        ticks: { color: "#7fa7d9", autoSkip: true, maxTicksLimit: 8, maxRotation: 0, minRotation: 0 },
        grid: { color: "rgba(20, 41, 69, 0.8)" }
      },
      y: {
        beginAtZero: true,
        ticks: { color: "#7fa7d9", callback: value => formatNumber(value) },
        grid: { color: "rgba(20, 41, 69, 0.8)" }
      }
    }
  };
}

function getBarRoasOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 100,
    plugins: {
      legend: {
        position: "top",
        labels: { color: "#d9ecff", usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 12 }
      },
      tooltip: {
        backgroundColor: "#08111f",
        borderColor: "#244b7c",
        borderWidth: 1,
        titleColor: "#ffffff",
        bodyColor: "#d9ecff",
        callbacks: { label: context => `${context.dataset.label}: ${formatRoas(context.parsed.y)}` }
      }
    },
    scales: {
      x: {
        ticks: { color: "#7fa7d9", autoSkip: true, maxTicksLimit: 8, maxRotation: 0, minRotation: 0 },
        grid: { color: "rgba(20, 41, 69, 0.8)" }
      },
      y: {
        beginAtZero: true,
        ticks: { color: "#7fa7d9", callback: value => `${Number(value).toFixed(1)}x` },
        grid: { color: "rgba(20, 41, 69, 0.8)" }
      }
    }
  };
}

function getDoughnutMoneyOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "58%",
    plugins: {
      legend: {
        position: "right",
        labels: { color: "#d9ecff", usePointStyle: true, boxWidth: 8, boxHeight: 8, padding: 14 }
      },
      tooltip: {
        backgroundColor: "#08111f",
        borderColor: "#244b7c",
        borderWidth: 1,
        titleColor: "#ffffff",
        bodyColor: "#d9ecff",
        callbacks: {
          label: function(context) {
            const values = context.dataset.data || [];
            const total = values.reduce((sum, value) => sum + (Number(value) || 0), 0);
            const value = Number(context.parsed) || 0;
            const pct = total > 0 ? (value / total) * 100 : 0;
            return `${context.label}: ${formatMoney(value)} (${pct.toFixed(1)}%)`;
          }
        }
      }
    }
  };
}

function renderOverviewChart(data) {
  const canvas = document.getElementById("performanceChart");
  if (!canvas) return;

  if (typeof Chart === "undefined") {
    setText("status", "Chart.js chưa được load");
    return;
  }

  if (currentChart) currentChart.destroy();

  currentChart = new Chart(canvas, {
    type: "line",
    data: {
      labels: data.map(row => row.dateText),
      datasets: [
        {
          label: "Total Sales",
          data: data.map(row => row.totalSales),
          borderColor: "#35d0ff",
          backgroundColor: "rgba(53, 208, 255, 0.12)",
          borderWidth: 3,
          pointRadius: 2,
          pointHoverRadius: 5,
          tension: 0.32,
          fill: false
        },
        {
          label: "Total Ads Spend",
          data: data.map(row => row.totalAdsSpend),
          borderColor: "#ffb84d",
          backgroundColor: "rgba(255, 184, 77, 0.12)",
          borderWidth: 3,
          pointRadius: 2,
          pointHoverRadius: 5,
          tension: 0.32,
          fill: false
        },
        {
          label: "Net Profit",
          data: data.map(row => row.profit),
          borderColor: "#27e98f",
          backgroundColor: "rgba(39, 233, 143, 0.12)",
          borderWidth: 3,
          pointRadius: 2,
          pointHoverRadius: 5,
          tension: 0.32,
          fill: false
        }
      ]
    },
    options: getLineChartOptions()
  });
}

function renderOverviewTable(data) {
  const tbody = document.getElementById("dataTable");
  if (!tbody) return;

  if (!data.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty-row">Không có dữ liệu trong khoảng đã chọn</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map(row => {
    const profitClass = row.profit >= 0 ? "positive" : "negative";

    return `
      <tr>
        <td>${escapeHtml(row.dateText)}</td>
        <td>${formatNumber(row.totalOrders)}</td>
        <td>${formatMoney(row.totalSales)}</td>
        <td>${formatMoney(row.fbAdsSpend)}</td>
        <td>${formatMoney(row.googleAdsSpend)}</td>
        <td>${formatMoney(row.totalAdsSpend)}</td>
        <td>${formatRoas(row.roas)}</td>
        <td class="${profitClass}">${formatMoney(row.profit)}</td>
        <td>${formatMoney(row.apiCost)}</td>
        <td>${formatMoney(row.fulfillCost)}</td>
        <td>${formatMoney(row.fixedCost)}</td>
      </tr>
    `;
  }).join("");
}

function renderOverviewDashboard(data, label) {
  updateOverviewKPIs(data);
  renderOverviewChart(data);
  renderOverviewTable(data);

  setText("status", data.length > 0 ? `Đã tải ${data.length} ngày dữ liệu` : "Không có dữ liệu trong khoảng đã chọn");
  setText("rangeLabel", label);
}

function destroyReportCharts() {
  Object.keys(reportCharts).forEach(key => {
    if (reportCharts[key]) {
      reportCharts[key].destroy();
      reportCharts[key] = null;
    }
  });
}

function createOrReplaceChart(chartKey, canvasId, config) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;

  if (reportCharts[chartKey]) reportCharts[chartKey].destroy();
  reportCharts[chartKey] = new Chart(canvas, config);
}

function ensureReportView(reportKey) {
  const source = REPORT_SOURCES[reportKey];
  let view = document.getElementById(`${reportKey}View`);

  if (!view) {
    view = document.createElement("section");
    view.id = `${reportKey}View`;
    view.className = `report-view ${reportKey}-view`;
    document.querySelector(".app")?.appendChild(view) || document.body.appendChild(view);
  }

  if (view.dataset.initialized) return view;

  if (source.type === "dimension") {
    view.innerHTML = buildDimensionViewHtml(reportKey);
  } else if (source.type === "combined") {
    view.innerHTML = buildCombinedViewHtml(reportKey);
  }

  view.dataset.initialized = "true";
  return view;
}

function buildKpiCardsHtml(prefix) {
  return `
    <div class="kpi-grid market-kpis report-kpis">
      <div class="kpi-card"><span>Total Sales</span><strong id="${prefix}TotalSales">$ 0.00</strong></div>
      <div class="kpi-card"><span>Total Orders</span><strong id="${prefix}TotalOrders">0</strong></div>
      <div class="kpi-card"><span>Total Ads Spend</span><strong id="${prefix}TotalAdsSpend">$ 0.00</strong><small id="${prefix}TotalAdsSpendPct">% 0.0</small></div>
      <div class="kpi-card"><span>FB Ads Spend</span><strong id="${prefix}FbAdsSpend">$ 0.00</strong><small id="${prefix}FbAdsSpendPct">% 0.0</small></div>
      <div class="kpi-card"><span>GG Ads Spend</span><strong id="${prefix}GgAdsSpend">$ 0.00</strong><small id="${prefix}GgAdsSpendPct">% 0.0</small></div>
      <div class="kpi-card"><span>ROAS</span><strong id="${prefix}Roas">0.00x</strong></div>
      <div class="kpi-card"><span>AOV</span><strong id="${prefix}Aov">$ 0.00</strong></div>
      <div class="kpi-card"><span>Items Sold</span><strong id="${prefix}ItemsSold">0</strong></div>
    </div>
  `;
}

function buildDimensionViewHtml(reportKey) {
  const source = REPORT_SOURCES[reportKey];
  const prefix = `${reportKey}`;

  return `
    <div class="market-header report-section">
      <div>
        <h2>${escapeHtml(source.label)} Performance</h2>
        <p>So sánh doanh thu, orders, ads spend và ROAS theo ${escapeHtml(source.dimensionLabel)}.</p>
      </div>
      <div class="market-note">${escapeHtml(source.note || "")}</div>
    </div>

    ${buildKpiCardsHtml(prefix)}

    <div class="chart-grid market-chart-grid report-chart-grid">
      <section class="chart-card">
        <h3>Sales Share by ${escapeHtml(source.dimensionLabel)}</h3>
        <div class="chart-box"><canvas id="${prefix}SalesShareChart"></canvas></div>
      </section>
      <section class="chart-card">
        <h3>Orders by ${escapeHtml(source.dimensionLabel)}</h3>
        <div class="chart-box"><canvas id="${prefix}OrdersChart"></canvas></div>
      </section>
      <section class="chart-card">
        <h3>ROAS by ${escapeHtml(source.dimensionLabel)}</h3>
        <div class="chart-box"><canvas id="${prefix}RoasChart"></canvas></div>
      </section>
      <section class="chart-card">
        <h3>Sales vs Ads Spend</h3>
        <div class="chart-box"><canvas id="${prefix}SalesAdsChart"></canvas></div>
      </section>
    </div>

    <section class="table-card market-table-card">
      <h3>${escapeHtml(source.dimensionLabel)} Ranking</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>${escapeHtml(source.dimensionLabel)}</th>
              <th>Total Orders</th>
              <th>Items Sold</th>
              <th>Total Sales</th>
              <th>AOV</th>
              <th>Total Ads Spend</th>
              <th>FB Ads Spend</th>
              <th>GG Ads Spend</th>
              <th>ROAS</th>
              <th>ROAS FB</th>
              <th>ROAS GG</th>
            </tr>
          </thead>
          <tbody id="${prefix}RankingTable"></tbody>
        </table>
      </div>
    </section>

    <section class="table-card market-table-card">
      <h3>Daily ${escapeHtml(source.label)} Data</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>${escapeHtml(source.dimensionLabel)}</th>
              <th>Total Orders</th>
              <th>Items Sold</th>
              <th>Total Sales</th>
              <th>AOV</th>
              <th>Total Ads Spend</th>
              <th>FB Ads Spend</th>
              <th>GG Ads Spend</th>
              <th>ROAS</th>
              <th>ROAS FB</th>
              <th>ROAS GG</th>
            </tr>
          </thead>
          <tbody id="${prefix}DailyTable"></tbody>
        </table>
      </div>
    </section>
  `;
}

function buildCombinedViewHtml(reportKey) {
  const prefix = `${reportKey}`;

  return `
    <div class="market-header report-section">
      <div>
        <h2>Combined Performance</h2>
        <p>Drill-down theo Market + Product Type + Recipient.</p>
      </div>
      <div class="market-note">${escapeHtml(REPORT_SOURCES[reportKey].note || "")}</div>
    </div>

    <section class="filter-card combined-filter-card">
      <div class="filter-row">
        <div class="filter-field">
          <label for="combinedMarketFilter">Market</label>
          <select id="combinedMarketFilter"><option value="all">All</option></select>
        </div>
        <div class="filter-field">
          <label for="combinedProductTypeFilter">Product Type</label>
          <select id="combinedProductTypeFilter"><option value="all">All</option></select>
        </div>
        <div class="filter-field">
          <label for="combinedRecipientFilter">Recipient</label>
          <select id="combinedRecipientFilter"><option value="all">All</option></select>
        </div>
      </div>
    </section>

    ${buildKpiCardsHtml(prefix)}

    <div class="chart-grid market-chart-grid report-chart-grid">
      <section class="chart-card">
        <h3>Top Combinations by Sales</h3>
        <div class="chart-box"><canvas id="${prefix}SalesChart"></canvas></div>
      </section>
      <section class="chart-card">
        <h3>Top Combinations by Orders</h3>
        <div class="chart-box"><canvas id="${prefix}OrdersChart"></canvas></div>
      </section>
      <section class="chart-card">
        <h3>ROAS by Top Combinations</h3>
        <div class="chart-box"><canvas id="${prefix}RoasChart"></canvas></div>
      </section>
      <section class="chart-card">
        <h3>Sales vs Ads Spend</h3>
        <div class="chart-box"><canvas id="${prefix}SalesAdsChart"></canvas></div>
      </section>
    </div>

    <section class="table-card market-table-card">
      <h3>Combined Ranking</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Market</th>
              <th>Product Type</th>
              <th>Recipient</th>
              <th>Total Orders</th>
              <th>Items Sold</th>
              <th>Total Sales</th>
              <th>AOV</th>
              <th>Total Ads Spend</th>
              <th>FB Ads Spend</th>
              <th>GG Ads Spend</th>
              <th>ROAS</th>
              <th>ROAS FB</th>
              <th>ROAS GG</th>
            </tr>
          </thead>
          <tbody id="${prefix}RankingTable"></tbody>
        </table>
      </div>
    </section>

    <section class="table-card market-table-card">
      <h3>Daily Combined Data</h3>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Market</th>
              <th>Product Type</th>
              <th>Recipient</th>
              <th>Total Orders</th>
              <th>Items Sold</th>
              <th>Total Sales</th>
              <th>AOV</th>
              <th>Total Ads Spend</th>
              <th>FB Ads Spend</th>
              <th>GG Ads Spend</th>
              <th>ROAS</th>
              <th>ROAS FB</th>
              <th>ROAS GG</th>
            </tr>
          </thead>
          <tbody id="${prefix}DailyTable"></tbody>
        </table>
      </div>
    </section>
  `;
}

function updatePerformanceKpis(prefix, rows) {
  const totals = calculatePerformanceTotals(rows);

  setText(`${prefix}TotalSales`, formatMoney(totals.totalSales));
  setText(`${prefix}TotalOrders`, formatNumber(totals.totalOrders));
  setText(`${prefix}TotalAdsSpend`, formatMoney(totals.totalAdsSpend));
  setText(`${prefix}TotalAdsSpendPct`, formatPercent(safePercent(totals.totalAdsSpend, totals.totalSales)));
  setText(`${prefix}FbAdsSpend`, formatMoney(totals.fbAdsSpend));
  setText(`${prefix}FbAdsSpendPct`, formatPercent(safePercent(totals.fbAdsSpend, totals.totalAdsSpend)));
  setText(`${prefix}GgAdsSpend`, formatMoney(totals.ggAdsSpend));
  setText(`${prefix}GgAdsSpendPct`, formatPercent(safePercent(totals.ggAdsSpend, totals.totalAdsSpend)));
  setText(`${prefix}Roas`, formatRoas(totals.roas));
  setText(`${prefix}Aov`, formatMoney(totals.aov));
  setText(`${prefix}ItemsSold`, formatNumber(totals.itemsSold));
}

function renderDimensionCharts(reportKey, summaryRows) {
  if (typeof Chart === "undefined") {
    setText("status", "Chart.js chưa được load");
    return;
  }

  const prefix = reportKey;
  const labels = summaryRows.map(row => row.label);

  createOrReplaceChart(`${reportKey}-salesShare`, `${prefix}SalesShareChart`, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        label: "Total Sales",
        data: summaryRows.map(row => row.totalSales),
        backgroundColor: CHART_COLORS,
        borderColor: "#0d1d33",
        borderWidth: 2
      }]
    },
    options: getDoughnutMoneyOptions()
  });

  createOrReplaceChart(`${reportKey}-orders`, `${prefix}OrdersChart`, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total Orders",
        data: summaryRows.map(row => row.totalOrders),
        backgroundColor: "rgba(53, 208, 255, 0.65)",
        borderColor: "#35d0ff",
        borderWidth: 1
      }]
    },
    options: getBarNumberOptions()
  });

  createOrReplaceChart(`${reportKey}-roas`, `${prefix}RoasChart`, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "ROAS",
          data: summaryRows.map(row => row.roas),
          backgroundColor: "rgba(39, 233, 143, 0.65)",
          borderColor: "#27e98f",
          borderWidth: 1
        },
        {
          label: "ROAS FB",
          data: summaryRows.map(row => row.roasFb),
          backgroundColor: "rgba(255, 184, 77, 0.65)",
          borderColor: "#ffb84d",
          borderWidth: 1
        },
        {
          label: "ROAS GG",
          data: summaryRows.map(row => row.roasGg === null ? null : row.roasGg),
          backgroundColor: "rgba(159, 124, 255, 0.65)",
          borderColor: "#9f7cff",
          borderWidth: 1
        }
      ]
    },
    options: getBarRoasOptions()
  });

  createOrReplaceChart(`${reportKey}-salesAds`, `${prefix}SalesAdsChart`, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Total Sales",
          data: summaryRows.map(row => row.totalSales),
          backgroundColor: "rgba(53, 208, 255, 0.65)",
          borderColor: "#35d0ff",
          borderWidth: 1
        },
        {
          label: "Total Ads Spend",
          data: summaryRows.map(row => row.totalAdsSpend),
          backgroundColor: "rgba(255, 184, 77, 0.65)",
          borderColor: "#ffb84d",
          borderWidth: 1
        }
      ]
    },
    options: getBarMoneyOptions(false)
  });
}

function renderDimensionRankingTable(reportKey, summaryRows) {
  const tbody = document.getElementById(`${reportKey}RankingTable`);
  if (!tbody) return;

  if (!summaryRows.length) {
    tbody.innerHTML = `<tr><td colspan="11" class="empty-row">Không có dữ liệu trong khoảng đã chọn</td></tr>`;
    return;
  }

  tbody.innerHTML = summaryRows.map(row => `
    <tr>
      <td><strong>${escapeHtml(row.label)}</strong></td>
      <td>${formatNumber(row.totalOrders)}</td>
      <td>${formatNumber(row.itemsSold)}</td>
      <td>${formatMoney(row.totalSales)}</td>
      <td>${formatMoney(row.aov)}</td>
      <td>${formatMoney(row.totalAdsSpend)}</td>
      <td>${formatMoney(row.fbAdsSpend)}</td>
      <td>${formatMoney(row.ggAdsSpend)}</td>
      <td>${formatRoas(row.roas)}</td>
      <td>${formatRoas(row.roasFb)}</td>
      <td>${formatRoas(row.roasGg)}</td>
    </tr>
  `).join("");
}

function renderDimensionDailyTable(reportKey, rows) {
  const tbody = document.getElementById(`${reportKey}DailyTable`);
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="12" class="empty-row">Không có daily data trong khoảng đã chọn</td></tr>`;
    return;
  }

  const displayRows = rows.slice().sort((a, b) => b.dateObj - a.dateObj || a.dimensionValue.localeCompare(b.dimensionValue)).slice(0, DAILY_ROW_LIMIT);
  const limitNote = rows.length > DAILY_ROW_LIMIT
    ? `<tr><td colspan="12" class="empty-row">Đang hiển thị ${DAILY_ROW_LIMIT}/${rows.length} dòng sau khi filter</td></tr>`
    : "";

  tbody.innerHTML = displayRows.map(row => `
    <tr>
      <td>${escapeHtml(row.dateText)}</td>
      <td><strong>${escapeHtml(row.dimensionValue)}</strong></td>
      <td>${formatNumber(row.totalOrders)}</td>
      <td>${formatNumber(row.itemsSold)}</td>
      <td>${formatMoney(row.totalSales)}</td>
      <td>${formatMoney(row.aov)}</td>
      <td>${formatMoney(row.totalAdsSpend)}</td>
      <td>${formatMoney(row.fbAdsSpend)}</td>
      <td>${formatMoney(row.ggAdsSpend)}</td>
      <td>${formatRoas(row.roas)}</td>
      <td>${formatRoas(row.roasFb)}</td>
      <td>${formatRoas(row.roasGg)}</td>
    </tr>
  `).join("") + limitNote;
}

function renderDimensionDashboard(reportKey, data, label) {
  ensureReportView(reportKey);
  const summaryRows = aggregateByDimension(data);

  updatePerformanceKpis(reportKey, summaryRows);
  renderDimensionCharts(reportKey, summaryRows);
  renderDimensionRankingTable(reportKey, summaryRows);
  renderDimensionDailyTable(reportKey, data);

  setText("status", data.length > 0 ? `Đã tải ${data.length} dòng ${REPORT_SOURCES[reportKey].label}` : `Không có dữ liệu ${REPORT_SOURCES[reportKey].label} trong khoảng đã chọn`);
  setText("rangeLabel", label);
}

function populateSelectOptions(selectId, values) {
  const select = document.getElementById(selectId);
  if (!select) return;

  const currentValue = select.value || "all";
  const uniqueValues = Array.from(new Set(values.filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));

  select.innerHTML = `<option value="all">All</option>` + uniqueValues.map(value => `
    <option value="${escapeHtml(value)}">${escapeHtml(value)}</option>
  `).join("");

  if (uniqueValues.includes(currentValue)) select.value = currentValue;
}

function setupCombinedFilters() {
  if (combinedFiltersInitialized) return;

  const marketFilter = document.getElementById("combinedMarketFilter");
  const productTypeFilter = document.getElementById("combinedProductTypeFilter");
  const recipientFilter = document.getElementById("combinedRecipientFilter");

  if (!marketFilter || !productTypeFilter || !recipientFilter) return;

  [marketFilter, productTypeFilter, recipientFilter].forEach(filter => {
    filter.addEventListener("change", rerenderCurrentRange);
  });

  combinedFiltersInitialized = true;
}

function refreshCombinedFilterOptions(rows) {
  populateSelectOptions("combinedMarketFilter", rows.map(row => row.market));
  populateSelectOptions("combinedProductTypeFilter", rows.map(row => row.productType));
  populateSelectOptions("combinedRecipientFilter", rows.map(row => row.recipient));
}

function applyCombinedFilters(rows) {
  const marketValue = document.getElementById("combinedMarketFilter")?.value || "all";
  const productTypeValue = document.getElementById("combinedProductTypeFilter")?.value || "all";
  const recipientValue = document.getElementById("combinedRecipientFilter")?.value || "all";

  return rows.filter(row => {
    const marketOk = marketValue === "all" || row.market === marketValue;
    const productOk = productTypeValue === "all" || row.productType === productTypeValue;
    const recipientOk = recipientValue === "all" || row.recipient === recipientValue;
    return marketOk && productOk && recipientOk;
  });
}

function renderCombinedCharts(summaryRows) {
  if (typeof Chart === "undefined") {
    setText("status", "Chart.js chưa được load");
    return;
  }

  const prefix = "combined";
  const topRows = summaryRows.slice(0, COMBINED_TOP_LIMIT);
  const labels = topRows.map(row => row.label);

  createOrReplaceChart("combined-sales", `${prefix}SalesChart`, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total Sales",
        data: topRows.map(row => row.totalSales),
        backgroundColor: "rgba(53, 208, 255, 0.65)",
        borderColor: "#35d0ff",
        borderWidth: 1
      }]
    },
    options: getBarMoneyOptions(false)
  });

  createOrReplaceChart("combined-orders", `${prefix}OrdersChart`, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Total Orders",
        data: topRows.map(row => row.totalOrders),
        backgroundColor: "rgba(39, 233, 143, 0.65)",
        borderColor: "#27e98f",
        borderWidth: 1
      }]
    },
    options: getBarNumberOptions()
  });

  createOrReplaceChart("combined-roas", `${prefix}RoasChart`, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "ROAS",
        data: topRows.map(row => row.roas),
        backgroundColor: "rgba(255, 184, 77, 0.65)",
        borderColor: "#ffb84d",
        borderWidth: 1
      }]
    },
    options: getBarRoasOptions()
  });

  createOrReplaceChart("combined-salesAds", `${prefix}SalesAdsChart`, {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Total Sales",
          data: topRows.map(row => row.totalSales),
          backgroundColor: "rgba(53, 208, 255, 0.65)",
          borderColor: "#35d0ff",
          borderWidth: 1
        },
        {
          label: "Total Ads Spend",
          data: topRows.map(row => row.totalAdsSpend),
          backgroundColor: "rgba(255, 184, 77, 0.65)",
          borderColor: "#ffb84d",
          borderWidth: 1
        }
      ]
    },
    options: getBarMoneyOptions(false)
  });
}

function renderCombinedRankingTable(summaryRows) {
  const tbody = document.getElementById("combinedRankingTable");
  if (!tbody) return;

  if (!summaryRows.length) {
    tbody.innerHTML = `<tr><td colspan="13" class="empty-row">Không có combined data trong khoảng đã chọn</td></tr>`;
    return;
  }

  tbody.innerHTML = summaryRows.map(row => `
    <tr>
      <td><strong>${escapeHtml(row.market)}</strong></td>
      <td>${escapeHtml(row.productType)}</td>
      <td>${escapeHtml(row.recipient)}</td>
      <td>${formatNumber(row.totalOrders)}</td>
      <td>${formatNumber(row.itemsSold)}</td>
      <td>${formatMoney(row.totalSales)}</td>
      <td>${formatMoney(row.aov)}</td>
      <td>${formatMoney(row.totalAdsSpend)}</td>
      <td>${formatMoney(row.fbAdsSpend)}</td>
      <td>${formatMoney(row.ggAdsSpend)}</td>
      <td>${formatRoas(row.roas)}</td>
      <td>${formatRoas(row.roasFb)}</td>
      <td>${formatRoas(row.roasGg)}</td>
    </tr>
  `).join("");
}

function renderCombinedDailyTable(rows) {
  const tbody = document.getElementById("combinedDailyTable");
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="14" class="empty-row">Không có daily combined data trong khoảng đã chọn</td></tr>`;
    return;
  }

  const displayRows = rows.slice()
    .sort((a, b) => b.dateObj - a.dateObj || makeCombinationLabel(a).localeCompare(makeCombinationLabel(b)))
    .slice(0, DAILY_ROW_LIMIT);

  const limitNote = rows.length > DAILY_ROW_LIMIT
    ? `<tr><td colspan="14" class="empty-row">Đang hiển thị ${DAILY_ROW_LIMIT}/${rows.length} dòng sau khi filter</td></tr>`
    : "";

  tbody.innerHTML = displayRows.map(row => `
    <tr>
      <td>${escapeHtml(row.dateText)}</td>
      <td><strong>${escapeHtml(row.market)}</strong></td>
      <td>${escapeHtml(row.productType)}</td>
      <td>${escapeHtml(row.recipient)}</td>
      <td>${formatNumber(row.totalOrders)}</td>
      <td>${formatNumber(row.itemsSold)}</td>
      <td>${formatMoney(row.totalSales)}</td>
      <td>${formatMoney(row.aov)}</td>
      <td>${formatMoney(row.totalAdsSpend)}</td>
      <td>${formatMoney(row.fbAdsSpend)}</td>
      <td>${formatMoney(row.ggAdsSpend)}</td>
      <td>${formatRoas(row.roas)}</td>
      <td>${formatRoas(row.roasFb)}</td>
      <td>${formatRoas(row.roasGg)}</td>
    </tr>
  `).join("") + limitNote;
}

function renderCombinedDashboard(data, label) {
  ensureReportView("combined");
  setupCombinedFilters();
  refreshCombinedFilterOptions(data);

  const filteredRows = applyCombinedFilters(data);
  const summaryRows = aggregateCombined(filteredRows);

  updatePerformanceKpis("combined", summaryRows);
  renderCombinedCharts(summaryRows);
  renderCombinedRankingTable(summaryRows);
  renderCombinedDailyTable(filteredRows);

  setText("status", filteredRows.length > 0 ? `Đã tải ${filteredRows.length}/${data.length} dòng Combined` : "Không có dữ liệu Combined trong filter hiện tại");
  setText("rangeLabel", label);
}

function getActiveData() {
  return reportData[activeReport] || [];
}

function renderActiveReport(data, label) {
  const source = REPORT_SOURCES[activeReport];

  if (source.type === "overview") {
    renderOverviewDashboard(data, label);
    return;
  }

  if (source.type === "dimension") {
    renderDimensionDashboard(activeReport, data, label);
    return;
  }

  if (source.type === "combined") {
    renderCombinedDashboard(data, label);
  }
}

function filterBetweenDates(startDate, endDate) {
  if (!startDate || !endDate) return [];

  const start = dateOnly(startDate);
  const end = dateOnly(endDate);
  const data = getActiveData();

  return data.filter(row => {
    const current = dateOnly(row.dateObj);
    return current >= start && current <= end;
  });
}

function applyRange(range) {
  const data = getActiveData();

  if (!data.length) {
    renderActiveReport([], "No data");
    return;
  }

  const latestDate = getLatestDate(data);

  if (range === "all" || !latestDate) {
    renderActiveReport(data, "All data");
    return;
  }

  let startDate = latestDate;
  let endDate = latestDate;
  let label = "All data";

  if (range === "yesterday") {
    startDate = latestDate;
    endDate = latestDate;
    label = `Yesterday: ${toInputDate(latestDate)}`;
  } else if (range === "last3") {
    startDate = addDays(latestDate, -2);
    endDate = latestDate;
    label = `Last 3 days: ${toInputDate(startDate)} → ${toInputDate(endDate)}`;
  } else if (range === "last7") {
    startDate = addDays(latestDate, -6);
    endDate = latestDate;
    label = `Last 7 days: ${toInputDate(startDate)} → ${toInputDate(endDate)}`;
  } else {
    renderActiveReport(data, "All data");
    return;
  }

  renderActiveReport(filterBetweenDates(startDate, endDate), label);
}

function applyCustomRange() {
  const fromInput = document.getElementById("fromDate");
  const toInput = document.getElementById("toDate");

  if (!fromInput || !toInput) return;

  const fromValue = fromInput.value;
  const toValue = toInput.value;

  if (!fromValue || !toValue) {
    setText("status", "Vui lòng chọn đủ From Date và To Date");
    return;
  }

  const fromDate = parseDate(fromValue);
  const toDate = parseDate(toValue);

  if (!fromDate || !toDate) {
    setText("status", "Date không hợp lệ");
    return;
  }

  if (fromDate > toDate) {
    setText("status", "From Date không được lớn hơn To Date");
    return;
  }

  renderActiveReport(filterBetweenDates(fromDate, toDate), `Custom: ${fromValue} → ${toValue}`);
}

function rerenderCurrentRange() {
  const timeRange = document.getElementById("timeRange");
  const selectedRange = timeRange ? timeRange.value : "all";

  if (selectedRange === "custom") applyCustomRange();
  else applyRange(selectedRange || "all");
}

function setupFilters() {
  if (filtersInitialized) return;

  const timeRange = document.getElementById("timeRange");
  const customRange = document.getElementById("customRange");
  const applyCustom = document.getElementById("applyCustom");

  if (!timeRange || !customRange || !applyCustom) return;

  filtersInitialized = true;

  timeRange.addEventListener("change", function() {
    const selectedRange = this.value;

    if (selectedRange === "custom") {
      customRange.classList.add("show");

      const latestDate = getLatestDate(getActiveData());

      if (latestDate) {
        const latestInputDate = toInputDate(latestDate);
        const fromInput = document.getElementById("fromDate");
        const toInput = document.getElementById("toDate");

        if (fromInput) fromInput.value = latestInputDate;
        if (toInput) toInput.value = latestInputDate;
      }

      setText("rangeLabel", "Custom: chọn From Date và To Date");
      setText("status", "Chọn From Date và To Date rồi bấm Apply");
      return;
    }

    customRange.classList.remove("show");
    applyRange(selectedRange);
  });

  applyCustom.addEventListener("click", applyCustomRange);
}

function isNonEmptyCsvRow(row) {
  return Array.isArray(row) && row.some(cell => normalizeHeader(cell) !== "");
}

function parseCsvResultsToData(results, reportKey, csvUrl) {
  if (results.errors && results.errors.length > 0) {
    console.warn("PapaParse warnings/errors:", results.errors);
  }

  const rows = (results.data || [])
    .filter(isNonEmptyCsvRow)
    .map(row => row.map(cell => cell ?? ""));

  console.groupCollapsed(`Koccie CSV Debug - ${reportKey}`);
  console.log("Resolved CSV URL:", csvUrl);
  console.log("First 20 parsed rows:", rows.slice(0, 20));
  console.groupEnd();

  if (!rows.length) throw new Error("CSV không có dữ liệu hoặc link chưa đúng dạng CSV");

  const headerIndex = findHeaderIndex(rows, reportKey);
  if (headerIndex === -1) throw new Error("Không tìm thấy dòng header ở cột A: Date");

  const parsed = rowsToObjects(rows, headerIndex);
  const headers = parsed.headers;
  const rawObjects = parsed.objects;

  const coreHeaders = CORE_HEADERS_BY_REPORT[reportKey] || ["Date"];
  const expectedHeaders = EXPECTED_HEADERS_BY_REPORT[reportKey] || coreHeaders;
  const missingCoreHeaders = getMissingHeaders(headers, coreHeaders);

  if (missingCoreHeaders.length > 0) {
    throw new Error(`Tìm thấy Date ở dòng ${headerIndex + 1}, nhưng thiếu header: ${missingCoreHeaders.join(", ")}`);
  }

  const missingExpectedHeaders = getMissingHeaders(headers, expectedHeaders);
  if (missingExpectedHeaders.length > 0) {
    console.warn(`Một số header không có trong CSV ${reportKey}. Các chỉ số tương ứng có thể về 0:`, missingExpectedHeaders);
  }

  const source = REPORT_SOURCES[reportKey];
  const normalizedRows = source.type === "overview"
    ? rawObjects.map(normalizeOverviewRow)
    : rawObjects.map(row => normalizeReportRow(row, reportKey));

  const validRows = normalizedRows.filter(row => isValidReportRow(row, reportKey));
  const invalidRows = normalizedRows.filter(row => !isValidReportRow(row, reportKey));
  const sortedRows = validRows.sort((a, b) => a.dateObj - b.dateObj);

  console.groupCollapsed(`Koccie Data Debug - ${reportKey}`);
  console.log("Header row number:", headerIndex + 1);
  console.log("Headers:", headers);
  console.log("Raw data rows:", rawObjects.length);
  console.log("Valid rows:", sortedRows.length);
  console.log("Skipped rows:", invalidRows.length);
  console.log("Sample valid rows:", sortedRows.slice(0, 5));
  console.groupEnd();

  return sortedRows;
}

function loadReportData(reportKey) {
  const csvUrl = getResolvedCsvUrl(reportKey);
  const source = REPORT_SOURCES[reportKey];

  setText("status", `Đang tải dữ liệu ${source.label}...`);

  if (!csvUrl || csvUrl.startsWith("DAN_LINK_CSV")) {
    throw new Error(`Chưa cấu hình CSV URL cho tab ${source.label} trong app.js`);
  }

  if (typeof Papa === "undefined") {
    throw new Error("PapaParse chưa được load");
  }

  return new Promise((resolve, reject) => {
    Papa.parse(csvUrl, {
      download: true,
      header: false,
      skipEmptyLines: true,
      complete: function(results) {
        try {
          const data = parseCsvResultsToData(results, reportKey, csvUrl);
          reportData[reportKey] = data;
          reportLoaded[reportKey] = true;
          resolve(data);
        } catch (error) {
          reject(error);
        }
      },
      error: function(error) {
        console.error("CSV load error:", error);
        reject(new Error("Lỗi tải dữ liệu CSV"));
      }
    });
  });
}

function rememberOverviewNodes() {
  if (overviewNodes.length) return;

  const app = document.querySelector(".app") || document.body;

  overviewNodes = Array.from(app.children).filter(node => {
    if (node.id === "reportTabs") return false;
    if (node.classList.contains("report-view")) return false;
    if (node.classList.contains("header")) return false;
    if (node.classList.contains("filter-card")) return false;
    return true;
  });
}

function setOverviewVisible(isVisible) {
  rememberOverviewNodes();
  overviewNodes.forEach(node => {
    node.style.display = isVisible ? "" : "none";
  });
}

function setReportViewsVisible(activeKey) {
  Object.keys(REPORT_SOURCES).forEach(key => {
    if (REPORT_SOURCES[key].type === "overview") return;

    const view = document.getElementById(`${key}View`);
    if (view) view.style.display = key === activeKey ? "" : "none";
  });
}

function ensureTabs() {
  if (tabsInitialized) return;

  const app = document.querySelector(".app") || document.body;
  const header = document.querySelector(".header");
  const tabs = document.createElement("nav");

  tabs.id = "reportTabs";
  tabs.className = "report-tabs";
  tabs.innerHTML = Object.entries(REPORT_SOURCES).map(([key, source]) => `
    <button type="button" class="report-tab ${key === activeReport ? "active" : ""}" data-report="${key}">${escapeHtml(source.label)}</button>
  `).join("");

  if (header && header.parentNode) header.parentNode.insertBefore(tabs, header.nextSibling);
  else app.insertBefore(tabs, app.firstChild);

  tabs.addEventListener("click", function(event) {
    const button = event.target.closest("[data-report]");
    if (!button) return;
    switchReport(button.dataset.report);
  });

  tabsInitialized = true;
}

function updateActiveTabUi() {
  document.querySelectorAll(".report-tab").forEach(button => {
    button.classList.toggle("active", button.dataset.report === activeReport);
  });
}

async function switchReport(reportKey) {
  if (!REPORT_SOURCES[reportKey]) return;

  activeReport = reportKey;
  updateActiveTabUi();
  destroyReportCharts();

  const source = REPORT_SOURCES[reportKey];

  if (source.type === "overview") {
    setReportViewsVisible(null);
    setOverviewVisible(true);
  } else {
    ensureReportView(reportKey);
    setOverviewVisible(false);
    setReportViewsVisible(reportKey);
  }

  try {
    if (!reportLoaded[reportKey]) await loadReportData(reportKey);
    rerenderCurrentRange();
  } catch (error) {
    console.error(error);
    renderActiveReport([], "Load error");
    setText("status", error.message || "Lỗi tải dữ liệu");
  }
}

async function initDashboard() {
  ensureTabs();
  setupFilters();

  Object.keys(REPORT_SOURCES).forEach(key => {
    if (REPORT_SOURCES[key].type !== "overview") {
      ensureReportView(key).style.display = "none";
    }
  });

  try {
    await loadReportData("overview");
    await switchReport("overview");
  } catch (error) {
    console.error(error);
    renderOverviewDashboard([], "Load error");
    setText("status", error.message || "Lỗi tải dữ liệu CSV");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDashboard);
} else {
  initDashboard();
}
