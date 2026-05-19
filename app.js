"use strict";

/*
  Koccie Performance Overview

  File này hỗ trợ 2 tab:
  - Overview: đọc CSV từ sheet Overview hiện tại.
  - Market: đọc CSV từ sheet Report_Market.

  Việc cần làm:
  - Thay MARKET_CSV_URL bằng link CSV publish riêng của sheet Report_Market.
*/

const REPORT_SOURCES = {
  overview: {
    label: "Overview",
    csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSexO0zuj22HikxPvejxlLq1xc6OxgcMKavxvfcrZjUBo3DmzK20_pMVzINDWzUOSC_FZ6-sf10H3bN/pub?gid=1575530320&single=true&output=csv"
  },
  market: {
    label: "Market",
    csvUrl: "https://docs.google.com/spreadsheets/d/e/2PACX-1vSexO0zuj22HikxPvejxlLq1xc6OxgcMKavxvfcrZjUBo3DmzK20_pMVzINDWzUOSC_FZ6-sf10H3bN/pub?gid=1730682205&single=true&output=csv"
  }
};

/*
  Khi ngày trong CSV có dạng mơ hồ như 05/12/2026:
  - "MDY" = May 12, 2026
  - "DMY" = 05 December, 2026

  Nếu Google Sheet đã format Date dạng YYYY-MM-DD thì biến này không ảnh hưởng.
*/
const DATE_FORMAT_PREFERENCE = "MDY";

const CORE_HEADERS_BY_REPORT = {
  overview: ["Date", "Total Orders", "Total Sales"],
  market: ["Date", "Market", "Total Orders", "Total Sales"]
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
  ]
};

let activeReport = "overview";

let reportData = {
  overview: [],
  market: []
};

let reportLoaded = {
  overview: false,
  market: false
};

let currentChart = null;
let marketCharts = {};
let filtersInitialized = false;
let tabsInitialized = false;
let overviewNodes = [];

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

  if (element) {
    element.textContent = value;
  }
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

  if (!rawUrl || rawUrl.startsWith("DAN_LINK_CSV")) {
    return rawUrl;
  }

  let resolvedUrl = rawUrl;

  if (/\/pubhtml/i.test(resolvedUrl)) {
    resolvedUrl = resolvedUrl.replace(/\/pubhtml/i, "/pub");
  }

  const isGoogleSheetUrl = /docs\.google\.com\/spreadsheets/i.test(resolvedUrl);
  const hasCsvOutput =
    /[?&]output=csv\b/i.test(resolvedUrl) ||
    /[?&]format=csv\b/i.test(resolvedUrl);

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

  if (absValue >= 1000000) {
    return `${sign}$ ${(absValue / 1000000).toFixed(1)}M`;
  }

  if (absValue >= 1000) {
    return `${sign}$ ${(absValue / 1000).toFixed(1)}K`;
  }

  return `${sign}$ ${absValue.toFixed(0)}`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

function formatPercent(value) {
  return `% ${(Number(value) || 0).toFixed(1)}`;
}

function formatRoas(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "N/A";
  }

  return `${(Number(value) || 0).toFixed(2)}x`;
}

function safeDivide(numerator, denominator) {
  const top = Number(numerator) || 0;
  const bottom = Number(denominator) || 0;

  if (bottom === 0) return 0;

  return top / bottom;
}

function safePercent(numerator, denominator) {
  return safeDivide(numerator, denominator) * 100;
}

function makeDate(year, month, day) {
  const date = new Date(year, month - 1, day);

  const isValid =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;

  return isValid ? date : null;
}

function normalizeYear(year) {
  if (year < 100) {
    return year >= 70 ? 1900 + year : 2000 + year;
  }

  return year;
}

function parseDate(value) {
  if (!value) return null;

  const raw = String(value).trim();

  if (!raw) return null;

  /* Google Sheets đôi khi export date serial number. */
  if (/^\d+(\.\d+)?$/.test(raw)) {
    const serialNumber = Number(raw);

    if (serialNumber > 20000 && serialNumber < 80000) {
      const utcMilliseconds = Math.round((serialNumber - 25569) * 86400 * 1000);
      const utcDate = new Date(utcMilliseconds);

      return new Date(
        utcDate.getUTCFullYear(),
        utcDate.getUTCMonth(),
        utcDate.getUTCDate()
      );
    }
  }

  /* ISO-like: 2026-05-12, 2026/05/12, 2026.05.12 */
  const ymd = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);

  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);

    return makeDate(year, month, day);
  }

  /* Dạng 05/12/2026, 05-12-2026, 05.12.2026 */
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
    return new Date(
      fallback.getFullYear(),
      fallback.getMonth(),
      fallback.getDate()
    );
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

    const matchedKey = keys.find(key =>
      normalizeHeader(key).toLowerCase() === normalizedName
    );

    if (matchedKey !== undefined) {
      return row[matchedKey];
    }
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

  if (candidates.length === 0) {
    return -1;
  }

  const strongCandidate = candidates.find(item =>
    coreHeaders.every(header => rowHasHeader(item.row, header))
  );

  return strongCandidate ? strongCandidate.index : candidates[0].index;
}

function getMissingHeaders(headers, expectedHeaders) {
  const normalizedHeaders = new Set(
    headers.map(header => normalizeHeader(header).toLowerCase())
  );

  return expectedHeaders.filter(header =>
    !normalizedHeaders.has(normalizeHeader(header).toLowerCase())
  );
}

function rowsToObjects(rows, headerIndex) {
  const headers = rows[headerIndex].map(header => normalizeHeader(header));
  const dataRows = rows.slice(headerIndex + 1);

  const objects = dataRows.map((row, rowOffset) => {
    const obj = {
      __rowNumber: headerIndex + 2 + rowOffset
    };

    headers.forEach((header, index) => {
      if (header) {
        obj[header] = row[index] ?? "";
      }
    });

    return obj;
  });

  return {
    headers,
    objects
  };
}

function normalizeOverviewRow(row) {
  const rawDateText = String(getValue(row, ["Date"]) || "").trim();
  const dateObj = parseDate(rawDateText);
  const dateText = dateObj ? toInputDate(dateObj) : rawDateText;

  const totalOrders = cleanNumber(getValue(row, ["Total Orders"]));
  const totalSales = cleanNumber(getValue(row, ["Total Sales"]));

  const fbAdsSpend = cleanNumber(getValue(row, ["FB Ads Spend"]));
  const googleAdsSpend = cleanNumber(getValue(row, ["Google Ads Spend"]));

  const totalAdsRaw = getValue(row, ["Total Ads Spend"]);
  let totalAdsSpend = cleanNumber(totalAdsRaw);

  if ((totalAdsRaw === "" || totalAdsSpend === 0) && (fbAdsSpend || googleAdsSpend)) {
    totalAdsSpend = fbAdsSpend + googleAdsSpend;
  }

  let roas = cleanNumber(getValue(row, ["ROAS"]));

  if (roas === 0 && totalAdsSpend > 0) {
    roas = totalSales / totalAdsSpend;
  }

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

function normalizeMarketRow(row) {
  const rawDateText = String(getValue(row, ["Date"]) || "").trim();
  const dateObj = parseDate(rawDateText);
  const dateText = dateObj ? toInputDate(dateObj) : rawDateText;
  const market = normalizeHeader(getValue(row, ["Market"])).toUpperCase();

  const totalOrders = cleanNumber(getValue(row, ["Total Orders"]));
  const totalSales = cleanNumber(getValue(row, ["Total Sales"]));
  const aovRaw = cleanNumber(getValue(row, ["AOV"]));
  const itemsSold = cleanNumber(getValue(row, ["Items Sold"]));

  const totalAdsSpend = cleanNumber(getValue(row, [
    "Total Ad spent",
    "Total Ads Spend",
    "Total Ads spent"
  ]));

  const fbAdsSpend = cleanNumber(getValue(row, [
    "FB Ad spent",
    "FB Ads Spend",
    "FB Ads spent"
  ]));

  const ggAdsSpend = cleanNumber(getValue(row, [
    "GG Ad spent",
    "Google Ads Spend",
    "GG Ads Spend"
  ]));

  return {
    rawDateText,
    dateText,
    dateObj,
    market,
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

function isValidMarketRow(row) {
  if (!isValidDataRow(row)) return false;
  if (!row.market || row.market === "MARKET") return false;
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

function aggregateMarketData(data) {
  const map = {};

  data.forEach(row => {
    const market = row.market || "UNKNOWN";

    if (!map[market]) {
      map[market] = {
        market,
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

    map[market].totalOrders += row.totalOrders;
    map[market].totalSales += row.totalSales;
    map[market].itemsSold += row.itemsSold;
    map[market].totalAdsSpend += row.totalAdsSpend;
    map[market].fbAdsSpend += row.fbAdsSpend;
    map[market].ggAdsSpend += row.ggAdsSpend;
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

function calculateMarketTotals(summaryRows) {
  const totals = summaryRows.reduce((acc, row) => {
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

function updateOverviewKPIs(data) {
  const totals = calculateOverviewTotals(data);

  const aov = safeDivide(totals.totalSales, totals.totalOrders);
  const roas = safeDivide(totals.totalSales, totals.totalAdsSpend);

  const totalAdsSpendPct = safePercent(totals.totalAdsSpend, totals.totalSales);
  const fbAdsSpendPct = safePercent(totals.fbAdsSpend, totals.totalAdsSpend);
  const googleAdsSpendPct = safePercent(totals.googleAdsSpend, totals.totalAdsSpend);
  const apiCostPct = safePercent(totals.apiCost, totals.totalSales);
  const fulfillCostPct = safePercent(totals.fulfillCost, totals.totalSales);

  setText("totalOrders", formatNumber(totals.totalOrders));
  setText("totalSales", formatMoney(totals.totalSales));
  setText("aov", formatMoney(aov));
  setText("roas", formatRoas(roas));
  setText("netProfit", formatMoney(totals.profit));
  setToneClass("netProfit", totals.profit);

  setText("totalAdsSpend", formatMoney(totals.totalAdsSpend));
  setText("totalAdsSpendPct", formatPercent(totalAdsSpendPct));

  setText("fbAdsSpend", formatMoney(totals.fbAdsSpend));
  setText("fbAdsSpendPct", formatPercent(fbAdsSpendPct));

  setText("googleAdsSpend", formatMoney(totals.googleAdsSpend));
  setText("googleAdsSpendPct", formatPercent(googleAdsSpendPct));

  setText("apiCost", formatMoney(totals.apiCost));
  setText("apiCostPct", formatPercent(apiCostPct));

  setText("fulfillCost", formatMoney(totals.fulfillCost));
  setText("fulfillCostPct", formatPercent(fulfillCostPct));
}

function getLineChartOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 100,
    interaction: {
      mode: "index",
      intersect: false
    },
    plugins: {
      legend: {
        position: "top",
        labels: {
          color: "#d9ecff",
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8,
          padding: 16
        }
      },
      tooltip: {
        backgroundColor: "#08111f",
        borderColor: "#244b7c",
        borderWidth: 1,
        titleColor: "#ffffff",
        bodyColor: "#d9ecff",
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${formatMoney(context.parsed.y)}`;
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: "#7fa7d9",
          autoSkip: true,
          maxTicksLimit: 10,
          maxRotation: 0,
          minRotation: 0
        },
        grid: {
          color: "rgba(20, 41, 69, 0.8)"
        }
      },
      y: {
        beginAtZero: false,
        ticks: {
          color: "#7fa7d9",
          maxTicksLimit: 8,
          callback: function(value) {
            return formatCompactMoney(value);
          }
        },
        grid: {
          color: "rgba(20, 41, 69, 0.8)"
        }
      }
    }
  };
}

function getBarMoneyOptions(stacked) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    resizeDelay: 100,
    interaction: {
      mode: "index",
      intersect: false
    },
    plugins: {
      legend: {
        position: "top",
        labels: {
          color: "#d9ecff",
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8,
          padding: 12
        }
      },
      tooltip: {
        backgroundColor: "#08111f",
        borderColor: "#244b7c",
        borderWidth: 1,
        titleColor: "#ffffff",
        bodyColor: "#d9ecff",
        callbacks: {
          label: function(context) {
            return `${context.dataset.label}: ${formatMoney(context.parsed.y)}`;
          }
        }
      }
    },
    scales: {
      x: {
        stacked: Boolean(stacked),
        ticks: {
          color: "#7fa7d9"
        },
        grid: {
          color: "rgba(20, 41, 69, 0.8)"
        }
      },
      y: {
        stacked: Boolean(stacked),
        beginAtZero: true,
        ticks: {
          color: "#7fa7d9",
          callback: function(value) {
            return formatCompactMoney(value);
          }
        },
        grid: {
          color: "rgba(20, 41, 69, 0.8)"
        }
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
        labels: {
          color: "#d9ecff",
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8,
          padding: 12
        }
      },
      tooltip: {
        backgroundColor: "#08111f",
        borderColor: "#244b7c",
        borderWidth: 1,
        titleColor: "#ffffff",
        bodyColor: "#d9ecff",
        callbacks: {
          label: function(context) {
            const parsedValue = context.parsed.y;
            return `${context.dataset.label}: ${formatRoas(parsedValue)}`;
          }
        }
      }
    },
    scales: {
      x: {
        ticks: {
          color: "#7fa7d9"
        },
        grid: {
          color: "rgba(20, 41, 69, 0.8)"
        }
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: "#7fa7d9",
          callback: function(value) {
            return `${Number(value).toFixed(1)}x`;
          }
        },
        grid: {
          color: "rgba(20, 41, 69, 0.8)"
        }
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
        labels: {
          color: "#d9ecff",
          usePointStyle: true,
          boxWidth: 8,
          boxHeight: 8,
          padding: 14
        }
      },
      tooltip: {
        backgroundColor: "#08111f",
        borderColor: "#244b7c",
        borderWidth: 1,
        titleColor: "#ffffff",
        bodyColor: "#d9ecff",
        callbacks: {
          label: function(context) {
            const dataset = context.dataset || {};
            const values = dataset.data || [];
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

  if (currentChart) {
    currentChart.destroy();
  }

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
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="empty-row">Không có dữ liệu trong khoảng đã chọn</td>
      </tr>
    `;
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

  setText(
    "status",
    data.length > 0
      ? `Đã tải ${data.length} ngày dữ liệu`
      : "Không có dữ liệu trong khoảng đã chọn"
  );

  setText("rangeLabel", label);
}

function destroyMarketCharts() {
  Object.keys(marketCharts).forEach(key => {
    if (marketCharts[key]) {
      marketCharts[key].destroy();
      marketCharts[key] = null;
    }
  });
}

function ensureMarketView() {
  let marketView = document.getElementById("marketView");

  if (!marketView) {
    marketView = document.createElement("section");
    marketView.id = "marketView";
    marketView.className = "report-view market-view";
    document.querySelector(".app")?.appendChild(marketView) || document.body.appendChild(marketView);
  }

  if (!marketView.dataset.initialized) {
    marketView.innerHTML = `
      <div class="market-header report-section">
        <div>
          <h2>Market Performance</h2>
          <p>So sánh doanh thu, ads spend và ROAS theo từng thị trường.</p>
        </div>
        <div class="market-note">
          Google Ads hiện chỉ chạy ở FR. BEL và SWIZ sẽ hiển thị ROAS GG là N/A nếu không có spend.
        </div>
      </div>

      <div class="kpi-grid market-kpis">
        <div class="kpi-card">
          <span>Total Sales</span>
          <strong id="marketTotalSales">$ 0.00</strong>
        </div>
        <div class="kpi-card">
          <span>Total Orders</span>
          <strong id="marketTotalOrders">0</strong>
        </div>
        <div class="kpi-card">
          <span>Total Ads Spend</span>
          <strong id="marketTotalAdsSpend">$ 0.00</strong>
          <small id="marketTotalAdsSpendPct">% 0.0</small>
        </div>
        <div class="kpi-card">
          <span>FB Ads Spend</span>
          <strong id="marketFbAdsSpend">$ 0.00</strong>
          <small id="marketFbAdsSpendPct">% 0.0</small>
        </div>
        <div class="kpi-card">
          <span>GG Ads Spend</span>
          <strong id="marketGgAdsSpend">$ 0.00</strong>
          <small id="marketGgAdsSpendPct">% 0.0</small>
        </div>
        <div class="kpi-card">
          <span>ROAS</span>
          <strong id="marketRoas">0.00x</strong>
        </div>
        <div class="kpi-card">
          <span>AOV</span>
          <strong id="marketAov">$ 0.00</strong>
        </div>
        <div class="kpi-card">
          <span>Items Sold</span>
          <strong id="marketItemsSold">0</strong>
        </div>
      </div>

      <div class="chart-grid market-chart-grid">
        <section class="chart-card">
          <h3>Sales Share by Market</h3>
          <div class="chart-box"><canvas id="marketSalesChart"></canvas></div>
        </section>
        <section class="chart-card">
          <h3>ROAS by Market</h3>
          <div class="chart-box"><canvas id="marketRoasChart"></canvas></div>
        </section>
        <section class="chart-card">
          <h3>Sales vs Ads Spend</h3>
          <div class="chart-box"><canvas id="marketSalesAdsChart"></canvas></div>
        </section>
        <section class="chart-card">
          <h3>Ads Spend Split</h3>
          <div class="chart-box"><canvas id="marketAdsSplitChart"></canvas></div>
        </section>
      </div>

      <section class="table-card market-table-card">
        <h3>Market Ranking</h3>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Market</th>
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
            <tbody id="marketTable"></tbody>
          </table>
        </div>
      </section>
    `;

    marketView.dataset.initialized = "true";
  }

  return marketView;
}

function updateMarketKPIs(summaryRows) {
  const totals = calculateMarketTotals(summaryRows);

  setText("marketTotalSales", formatMoney(totals.totalSales));
  setText("marketTotalOrders", formatNumber(totals.totalOrders));
  setText("marketTotalAdsSpend", formatMoney(totals.totalAdsSpend));
  setText("marketTotalAdsSpendPct", formatPercent(safePercent(totals.totalAdsSpend, totals.totalSales)));
  setText("marketFbAdsSpend", formatMoney(totals.fbAdsSpend));
  setText("marketFbAdsSpendPct", formatPercent(safePercent(totals.fbAdsSpend, totals.totalAdsSpend)));
  setText("marketGgAdsSpend", formatMoney(totals.ggAdsSpend));
  setText("marketGgAdsSpendPct", formatPercent(safePercent(totals.ggAdsSpend, totals.totalAdsSpend)));
  setText("marketRoas", formatRoas(totals.roas));
  setText("marketAov", formatMoney(totals.aov));
  setText("marketItemsSold", formatNumber(totals.itemsSold));
}

function createOrReplaceChart(chartKey, canvasId, config) {
  const canvas = document.getElementById(canvasId);

  if (!canvas || typeof Chart === "undefined") return;

  if (marketCharts[chartKey]) {
    marketCharts[chartKey].destroy();
  }

  marketCharts[chartKey] = new Chart(canvas, config);
}

function renderMarketCharts(summaryRows) {
  if (typeof Chart === "undefined") {
    setText("status", "Chart.js chưa được load");
    return;
  }

  const labels = summaryRows.map(row => row.market);

  createOrReplaceChart("sales", "marketSalesChart", {
    type: "doughnut",
    data: {
      labels,
      datasets: [
        {
          label: "Total Sales",
          data: summaryRows.map(row => row.totalSales),
          backgroundColor: [
            "rgba(53, 208, 255, 0.72)",
            "rgba(39, 233, 143, 0.72)",
            "rgba(255, 184, 77, 0.72)",
            "rgba(159, 124, 255, 0.72)",
            "rgba(255, 92, 122, 0.72)"
          ],
          borderColor: "#0d1d33",
          borderWidth: 2
        }
      ]
    },
    options: getDoughnutMoneyOptions()
  });

  createOrReplaceChart("roas", "marketRoasChart", {
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

  createOrReplaceChart("salesAds", "marketSalesAdsChart", {
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

  createOrReplaceChart("adsSplit", "marketAdsSplitChart", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "FB Ads Spend",
          data: summaryRows.map(row => row.fbAdsSpend),
          backgroundColor: "rgba(255, 184, 77, 0.7)",
          borderColor: "#ffb84d",
          borderWidth: 1
        },
        {
          label: "GG Ads Spend",
          data: summaryRows.map(row => row.ggAdsSpend),
          backgroundColor: "rgba(159, 124, 255, 0.7)",
          borderColor: "#9f7cff",
          borderWidth: 1
        }
      ]
    },
    options: getBarMoneyOptions(true)
  });
}

function renderMarketTable(summaryRows) {
  const tbody = document.getElementById("marketTable");

  if (!tbody) return;

  if (!summaryRows.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="11" class="empty-row">Không có dữ liệu market trong khoảng đã chọn</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = summaryRows.map(row => {
    return `
      <tr>
        <td><strong>${escapeHtml(row.market)}</strong></td>
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
    `;
  }).join("");
}

function renderMarketDashboard(data, label) {
  ensureMarketView();

  const summaryRows = aggregateMarketData(data);

  updateMarketKPIs(summaryRows);
  renderMarketCharts(summaryRows);
  renderMarketTable(summaryRows);

  setText(
    "status",
    data.length > 0
      ? `Đã tải ${data.length} dòng Market`
      : "Không có dữ liệu Market trong khoảng đã chọn"
  );

  setText("rangeLabel", label);
}

function getActiveData() {
  return reportData[activeReport] || [];
}

function renderActiveReport(data, label) {
  if (activeReport === "market") {
    renderMarketDashboard(data, label);
    return;
  }

  renderOverviewDashboard(data, label);
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

  const filteredData = filterBetweenDates(startDate, endDate);

  renderActiveReport(filteredData, label);
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

  const filteredData = filterBetweenDates(fromDate, toDate);

  renderActiveReport(filteredData, `Custom: ${fromValue} → ${toValue}`);
}

function rerenderCurrentRange() {
  const timeRange = document.getElementById("timeRange");
  const selectedRange = timeRange ? timeRange.value : "all";

  if (selectedRange === "custom") {
    applyCustomRange();
  } else {
    applyRange(selectedRange || "all");
  }
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

  if (!rows.length) {
    throw new Error("CSV không có dữ liệu hoặc link chưa đúng dạng CSV");
  }

  const headerIndex = findHeaderIndex(rows, reportKey);

  if (headerIndex === -1) {
    console.groupCollapsed("Header Debug");
    console.log("Không tìm thấy row có cột A chính xác là Date");
    console.log("First 30 rows:", rows.slice(0, 30));
    console.groupEnd();

    throw new Error("Không tìm thấy dòng header ở cột A: Date");
  }

  const parsed = rowsToObjects(rows, headerIndex);
  const headers = parsed.headers;
  const rawObjects = parsed.objects;

  const coreHeaders = CORE_HEADERS_BY_REPORT[reportKey] || ["Date"];
  const expectedHeaders = EXPECTED_HEADERS_BY_REPORT[reportKey] || coreHeaders;
  const missingCoreHeaders = getMissingHeaders(headers, coreHeaders);

  if (missingCoreHeaders.length > 0) {
    console.groupCollapsed("Header Incomplete Debug");
    console.log("Header row number:", headerIndex + 1);
    console.log("Headers found:", headers);
    console.log("Missing core headers:", missingCoreHeaders);
    console.groupEnd();

    throw new Error(`Tìm thấy Date ở dòng ${headerIndex + 1}, nhưng thiếu header: ${missingCoreHeaders.join(", ")}`);
  }

  const missingExpectedHeaders = getMissingHeaders(headers, expectedHeaders);

  if (missingExpectedHeaders.length > 0) {
    console.warn(
      `Một số header không có trong CSV ${reportKey}. Các chỉ số tương ứng có thể về 0:`,
      missingExpectedHeaders
    );
  }

  const normalizedRows = reportKey === "market"
    ? rawObjects.map(normalizeMarketRow)
    : rawObjects.map(normalizeOverviewRow);

  const validRows = reportKey === "market"
    ? normalizedRows.filter(isValidMarketRow)
    : normalizedRows.filter(isValidDataRow);

  const invalidRows = normalizedRows.filter(row =>
    reportKey === "market" ? !isValidMarketRow(row) : !isValidDataRow(row)
  );

  const sortedRows = validRows.sort((a, b) => a.dateObj - b.dateObj);

  console.groupCollapsed(`Koccie Data Debug - ${reportKey}`);
  console.log("Header row number:", headerIndex + 1);
  console.log("Headers:", headers);
  console.log("Raw data rows:", rawObjects.length);
  console.log("Valid rows:", sortedRows.length);
  console.log("Skipped rows:", invalidRows.length);
  console.log("Sample valid rows:", sortedRows.slice(0, 5));
  console.log("Sample skipped rows:", invalidRows.slice(0, 5));
  console.groupEnd();

  return sortedRows;
}

function loadReportData(reportKey) {
  const csvUrl = getResolvedCsvUrl(reportKey);

  setText("status", `Đang tải dữ liệu ${REPORT_SOURCES[reportKey].label}...`);

  if (!csvUrl || csvUrl.startsWith("DAN_LINK_CSV")) {
    throw new Error(`Chưa cấu hình CSV URL cho tab ${REPORT_SOURCES[reportKey].label} trong app.js`);
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

  const marketView = document.getElementById("marketView");
  const app = document.querySelector(".app") || document.body;

  overviewNodes = Array.from(app.children).filter(node => {
    if (node === marketView) return false;
    if (node.id === "marketView") return false;
    if (node.id === "reportTabs") return false;

    /* Các phần dùng chung cho mọi tab, không được ẩn. */
    if (node.classList.contains("header")) return false;
    if (node.classList.contains("filter-card")) return false;

    /* Những node còn lại thường là KPI overview, chart overview, table overview. */
    return true;
  });
}

function setOverviewVisible(isVisible) {
  rememberOverviewNodes();

  overviewNodes.forEach(node => {
    node.style.display = isVisible ? "" : "none";
  });
}

function ensureTabs() {
  if (tabsInitialized) return;

  const app = document.querySelector(".app") || document.body;
  const header = document.querySelector(".header");
  const tabs = document.createElement("nav");

  tabs.id = "reportTabs";
  tabs.className = "report-tabs";
  tabs.innerHTML = `
    <button type="button" class="report-tab active" data-report="overview">Overview</button>
    <button type="button" class="report-tab" data-report="market">Market</button>
  `;

  if (header && header.parentNode) {
    header.parentNode.insertBefore(tabs, header.nextSibling);
  } else {
    app.insertBefore(tabs, app.firstChild);
  }

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

  const marketView = ensureMarketView();

  if (reportKey === "market") {
    setOverviewVisible(false);
    marketView.style.display = "";
  } else {
    marketView.style.display = "none";
    destroyMarketCharts();
    setOverviewVisible(true);
  }

  try {
    if (!reportLoaded[reportKey]) {
      await loadReportData(reportKey);
    }

    rerenderCurrentRange();
  } catch (error) {
    console.error(error);
    renderActiveReport([], "Load error");
    setText("status", error.message || "Lỗi tải dữ liệu");
  }
}

async function initDashboard() {
  ensureTabs();
  ensureMarketView().style.display = "none";
  setupFilters();

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
