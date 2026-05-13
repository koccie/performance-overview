"use strict";

/*
  Dán link Google Sheet published CSV vào đây.

  Dạng khuyến nghị:
  https://docs.google.com/spreadsheets/d/e/.../pub?gid=...&single=true&output=csv

  Nếu lỡ dán dạng /pubhtml?... code sẽ cố tự chuyển sang /pub?...&output=csv
*/
const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSexO0zuj22HikxPvejxlLq1xc6OxgcMKavxvfcrZjUBo3DmzK20_pMVzINDWzUOSC_FZ6-sf10H3bN/pub?gid=1575530320&single=true&output=csv";

/*
  Khi ngày trong CSV có dạng mơ hồ như 05/12/2026:
  - "MDY" = May 12, 2026
  - "DMY" = 05 December, 2026

  Nếu Google Sheet đã format Date dạng YYYY-MM-DD thì biến này không ảnh hưởng.
*/
const DATE_FORMAT_PREFERENCE = "MDY";

const CORE_HEADERS = [
  "Date",
  "Total Orders",
  "Total Sales"
];

const EXPECTED_HEADERS = [
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
];

let allData = [];
let currentChart = null;
let filtersInitialized = false;

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

function getResolvedCsvUrl() {
  const rawUrl = String(CSV_URL || "").trim();

  if (!rawUrl || rawUrl === "DAN_LINK_CSV_CUA_BAN_VAO_DAY") {
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

  /*
    Google Sheets đôi khi export date serial number.
    25569 = 1970-01-01 theo Excel/Google Sheets serial date.
  */
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

  /*
    ISO-like:
    2026-05-12
    2026/05/12
    2026.05.12
  */
  const ymd = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);

  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);

    return makeDate(year, month, day);
  }

  /*
    Dạng:
    05/12/2026
    05-12-2026
    05.12.2026

    Nếu cả ngày và tháng đều <= 12 thì dùng DATE_FORMAT_PREFERENCE.
  */
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

  /*
    Fallback cho các format như:
    May 12, 2026
    12 May 2026
  */
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

function findHeaderIndex(rows) {
  const candidates = rows
    .map((row, index) => ({ row, index }))
    .filter(item => normalizeHeader(item.row[0]).toLowerCase() === "date");

  if (candidates.length === 0) {
    return -1;
  }

  /*
    Ưu tiên dòng có cột A = Date và có đủ core headers.
    Nếu không thấy dòng đủ core headers thì fallback về dòng đầu tiên có cột A = Date.
  */
  const strongCandidate = candidates.find(item =>
    CORE_HEADERS.every(header => rowHasHeader(item.row, header))
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

function normalizeRow(row) {
  const rawDateText = String(getValue(row, ["Date"]) || "").trim();
  const dateObj = parseDate(rawDateText);
  const dateText = dateObj ? toInputDate(dateObj) : rawDateText;

  const totalOrders = cleanNumber(getValue(row, ["Total Orders"]));
  const totalSales = cleanNumber(getValue(row, ["Total Sales"]));

  const fbAdsSpend = cleanNumber(getValue(row, ["FB Ads Spend"]));
  const googleAdsSpend = cleanNumber(getValue(row, ["Google Ads Spend"]));

  const totalAdsRaw = getValue(row, ["Total Ads Spend"]);
  let totalAdsSpend = cleanNumber(totalAdsRaw);

  /*
    Fallback: nếu Total Ads Spend trống hoặc bằng 0 nhưng FB/Google có số,
    tự cộng FB Ads Spend + Google Ads Spend.
  */
  if ((totalAdsRaw === "" || totalAdsSpend === 0) && (fbAdsSpend || googleAdsSpend)) {
    totalAdsSpend = fbAdsSpend + googleAdsSpend;
  }

  let roas = cleanNumber(getValue(row, ["ROAS"]));

  if (roas === 0 && totalAdsSpend > 0) {
    roas = totalSales / totalAdsSpend;
  }

  const profit = cleanNumber(getValue(row, ["Profit"]));
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

function getLatestDate(data) {
  const dates = data
    .map(row => row.dateObj)
    .filter(Boolean)
    .map(dateOnly)
    .sort((a, b) => b - a);

  return dates[0] || null;
}

function calculateTotals(data) {
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

function updateKPIs(data) {
  const totals = calculateTotals(data);

  const aov = safeDivide(totals.totalSales, totals.totalOrders);
  const roas = safeDivide(totals.totalSales, totals.totalAdsSpend);

  const totalAdsSpendPct = safePercent(totals.totalAdsSpend, totals.totalSales);
  const fbAdsSpendPct = safePercent(totals.fbAdsSpend, totals.totalAdsSpend);
  const googleAdsSpendPct = safePercent(totals.googleAdsSpend, totals.totalAdsSpend);
  const apiCostPct = safePercent(totals.apiCost, totals.totalSales);
  const fulfillCostPct = safePercent(totals.fulfillCost, totals.totalSales);
  const fixedCostPct = safePercent(totals.fixedCost, totals.totalSales);

  setText("totalOrders", formatNumber(totals.totalOrders));
  setText("totalSales", formatMoney(totals.totalSales));

  setText("totalAdsSpend", formatMoney(totals.totalAdsSpend));
  setText("totalAdsSpendPct", formatPercent(totalAdsSpendPct));

  setText("fbAdsSpend", formatMoney(totals.fbAdsSpend));
  setText("fbAdsSpendPct", formatPercent(fbAdsSpendPct));

  setText("googleAdsSpend", formatMoney(totals.googleAdsSpend));
  setText("googleAdsSpendPct", formatPercent(googleAdsSpendPct));

  setText("aov", formatMoney(aov));
  setText("roas", formatRoas(roas));

  setText("apiCost", formatMoney(totals.apiCost));
  setText("apiCostPct", formatPercent(apiCostPct));

  setText("fulfillCost", formatMoney(totals.fulfillCost));
  setText("fulfillCostPct", formatPercent(fulfillCostPct));

  setText("fixedCost", formatMoney(totals.fixedCost));
  setText("fixedCostPct", formatPercent(fixedCostPct));

  setText("netProfit", formatMoney(totals.profit));
  setToneClass("netProfit", totals.profit);
}

function renderChart(data) {
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
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.35,
          fill: false
        },
        {
          label: "Total Ads Spend",
          data: data.map(row => row.totalAdsSpend),
          borderColor: "#ffb84d",
          backgroundColor: "rgba(255, 184, 77, 0.12)",
          borderWidth: 3,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.35,
          fill: false
        },
        {
          label: "Net Profit",
          data: data.map(row => row.profit),
          borderColor: "#27e98f",
          backgroundColor: "rgba(39, 233, 143, 0.12)",
          borderWidth: 3,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.35,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: "#d9ecff",
            usePointStyle: true,
            boxWidth: 8,
            boxHeight: 8
          }
        },
        tooltip: {
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
            maxRotation: 60,
            minRotation: 45
          },
          grid: {
            color: "#142945"
          }
        },
        y: {
          ticks: {
            color: "#7fa7d9",
            callback: function(value) {
              return formatCompactMoney(value);
            }
          },
          grid: {
            color: "#142945"
          }
        }
      }
    }
  });
}

function renderTable(data) {
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

function renderDashboard(data, label) {
  updateKPIs(data);
  renderChart(data);
  renderTable(data);

  setText(
    "status",
    data.length > 0
      ? `Đã tải ${data.length} ngày dữ liệu`
      : "Không có dữ liệu trong khoảng đã chọn"
  );

  setText("rangeLabel", label);
}

function filterBetweenDates(startDate, endDate) {
  if (!startDate || !endDate) return [];

  const start = dateOnly(startDate);
  const end = dateOnly(endDate);

  return allData.filter(row => {
    const current = dateOnly(row.dateObj);
    return current >= start && current <= end;
  });
}

function applyRange(range) {
  if (!allData.length) {
    renderDashboard([], "No data");
    return;
  }

  const latestDate = getLatestDate(allData);

  if (range === "all" || !latestDate) {
    renderDashboard(allData, "All data");
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
    renderDashboard(allData, "All data");
    return;
  }

  const filteredData = filterBetweenDates(startDate, endDate);

  renderDashboard(filteredData, label);
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

  renderDashboard(filteredData, `Custom: ${fromValue} → ${toValue}`);
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

      const latestDate = getLatestDate(allData);

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

function loadData() {
  const csvUrl = getResolvedCsvUrl();

  renderDashboard([], "Loading...");
  setText("status", "Đang tải dữ liệu...");

  if (!csvUrl || csvUrl === "DAN_LINK_CSV_CUA_BAN_VAO_DAY") {
    setText("status", "Chưa cấu hình CSV_URL trong app.js");
    setText("rangeLabel", "No CSV URL");
    return;
  }

  if (typeof Papa === "undefined") {
    setText("status", "PapaParse chưa được load");
    return;
  }

  Papa.parse(csvUrl, {
    download: true,
    header: false,
    skipEmptyLines: true,
    complete: function(results) {
      if (results.errors && results.errors.length > 0) {
        console.warn("PapaParse warnings/errors:", results.errors);
      }

      const rows = (results.data || [])
        .filter(isNonEmptyCsvRow)
        .map(row => row.map(cell => cell ?? ""));

      console.groupCollapsed("Koccie CSV Debug");
      console.log("Resolved CSV URL:", csvUrl);
      console.log("First 20 parsed rows:", rows.slice(0, 20));
      console.groupEnd();

      if (!rows.length) {
        renderDashboard([], "No data");
        setText("status", "CSV không có dữ liệu hoặc link chưa đúng dạng CSV");
        return;
      }

      const headerIndex = findHeaderIndex(rows);

      if (headerIndex === -1) {
        renderDashboard([], "Header not found");
        setText("status", "Không tìm thấy dòng header ở cột A: Date");

        console.groupCollapsed("Header Debug");
        console.log("Không tìm thấy row có cột A chính xác là Date");
        console.log("First 30 rows:", rows.slice(0, 30));
        console.groupEnd();

        return;
      }

      const parsed = rowsToObjects(rows, headerIndex);
      const headers = parsed.headers;
      const rawObjects = parsed.objects;

      const missingCoreHeaders = getMissingHeaders(headers, CORE_HEADERS);

      if (missingCoreHeaders.length > 0) {
        renderDashboard([], "Header incomplete");
        setText(
          "status",
          `Tìm thấy Date ở dòng ${headerIndex + 1}, nhưng thiếu header: ${missingCoreHeaders.join(", ")}`
        );

        console.groupCollapsed("Header Incomplete Debug");
        console.log("Header row number:", headerIndex + 1);
        console.log("Headers found:", headers);
        console.log("Missing core headers:", missingCoreHeaders);
        console.groupEnd();

        return;
      }

      const missingExpectedHeaders = getMissingHeaders(headers, EXPECTED_HEADERS);

      if (missingExpectedHeaders.length > 0) {
        console.warn("Một số header không có trong CSV. Các chỉ số tương ứng sẽ về 0:", missingExpectedHeaders);
      }

      const normalizedRows = rawObjects.map(normalizeRow);
      const validRows = normalizedRows.filter(isValidDataRow);
      const invalidRows = normalizedRows.filter(row => !isValidDataRow(row));

      allData = validRows.sort((a, b) => a.dateObj - b.dateObj);

      console.groupCollapsed("Koccie Data Debug");
      console.log("Header row number:", headerIndex + 1);
      console.log("Headers:", headers);
      console.log("Raw data rows:", rawObjects.length);
      console.log("Valid daily rows:", allData.length);
      console.log("Skipped rows:", invalidRows.length);
      console.log("Sample valid rows:", allData.slice(0, 5));
      console.log("Sample skipped rows:", invalidRows.slice(0, 5));
      console.groupEnd();

      setupFilters();

      if (!allData.length) {
        renderDashboard([], "No valid data");
        setText("status", "Tìm thấy header nhưng không có daily data hợp lệ");
        return;
      }

      const timeRange = document.getElementById("timeRange");
      const selectedRange = timeRange ? timeRange.value : "all";

      if (selectedRange === "custom") {
        applyCustomRange();
      } else {
        applyRange(selectedRange || "all");
      }
    },
    error: function(error) {
      console.error("CSV load error:", error);
      renderDashboard([], "Load error");
      setText("status", "Lỗi tải dữ liệu CSV");
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", loadData);
} else {
  loadData();
}
