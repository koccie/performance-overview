const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSexO0zuj22HikxPvejxlLq1xc6OxgcMKavxvfcrZjUBo3DmzK20_pMVzINDWzUOSC_FZ6-sf10H3bN/pubhtml?gid=1575530320&single=true";

let allData = [];
let currentChart = null;

function normalizeHeader(value) {
  return String(value || "")
    .replace(/\u00A0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
    .trim();

  const number = Number(cleaned);

  if (Number.isNaN(number)) return 0;

  if (negativeByParentheses) return -Math.abs(number);

  return number;
}

function formatMoney(value) {
  value = Number(value) || 0;

  const absValue = Math.abs(value);

  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(absValue);

  return value < 0 ? `-$ ${formatted}` : `$ ${formatted}`;
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
  numerator = Number(numerator) || 0;
  denominator = Number(denominator) || 0;

  if (denominator === 0) return 0;

  return numerator / denominator;
}

function safePercent(numerator, denominator) {
  return safeDivide(numerator, denominator) * 100;
}

function setText(id, value) {
  const element = document.getElementById(id);

  if (element) {
    element.textContent = value;
  }
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

function parseDate(value) {
  if (!value) return null;

  const raw = String(value).trim();

  const ymd = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);

  if (ymd) {
    const year = Number(ymd[1]);
    const month = Number(ymd[2]);
    const day = Number(ymd[3]);

    const date = new Date(year, month - 1, day);

    if (!Number.isNaN(date.getTime())) return date;
  }

  const dmyOrMdy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);

  if (dmyOrMdy) {
    let first = Number(dmyOrMdy[1]);
    let second = Number(dmyOrMdy[2]);
    const year = Number(dmyOrMdy[3]);

    let day = first;
    let month = second;

    if (second > 12) {
      month = first;
      day = second;
    }

    const date = new Date(year, month - 1, day);

    if (!Number.isNaN(date.getTime())) return date;
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

function normalizeRow(row) {
  const dateText = String(getValue(row, ["Date", "date", "Ngày"]) || "").trim();
  const dateObj = parseDate(dateText);

  const totalOrders = cleanNumber(getValue(row, [
    "Total Orders",
    "Orders",
    "orders"
  ]));

  const totalSales = cleanNumber(getValue(row, [
    "Total Sales",
    "Sales",
    "Revenue",
    "revenue"
  ]));

  const fbAdsSpend = cleanNumber(getValue(row, [
    "FB Ads Spend",
    "Facebook Ads Spend",
    "Meta Ads Spend",
    "FB Ads"
  ]));

  const googleAdsSpend = cleanNumber(getValue(row, [
    "Google Ads Spend",
    "GG Ads Spend",
    "Google Ads"
  ]));

  const totalAdsRaw = getValue(row, [
    "Total Ads Spend",
    "Ads Spend",
    "Total Ads",
    "ads"
  ]);

  let totalAdsSpend = cleanNumber(totalAdsRaw);

  if ((totalAdsRaw === "" || totalAdsSpend === 0) && (fbAdsSpend || googleAdsSpend)) {
    totalAdsSpend = fbAdsSpend + googleAdsSpend;
  }

  let roas = cleanNumber(getValue(row, [
    "ROAS",
    "roas"
  ]));

  if (roas === 0 && totalAdsSpend > 0) {
    roas = totalSales / totalAdsSpend;
  }

  const profit = cleanNumber(getValue(row, [
    "Profit",
    "Net Profit",
    "profit"
  ]));

  const apiCost = cleanNumber(getValue(row, [
    "API Cost",
    "Api Cost",
    "api cost",
    "API"
  ]));

  const fulfillCost = cleanNumber(getValue(row, [
    "Fulfill Cost",
    "Fulfillment Cost",
    "fulfill cost",
    "Fulfill"
  ]));

  const fixedCost = cleanNumber(getValue(row, [
    "Fixed Cost",
    "fixed cost",
    "Fixed"
  ]));

  return {
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
  if (!row.dateText) return false;

  const dateLower = row.dateText.toLowerCase();

  if (dateLower.includes("total")) return false;
  if (dateLower.includes("date")) return false;
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

  const profitElement = document.getElementById("netProfit");

  if (profitElement) {
    profitElement.className = totals.profit >= 0 ? "positive" : "negative";
  }
}

function renderChart(data) {
  const ctx = document.getElementById("performanceChart");

  if (currentChart) {
    currentChart.destroy();
  }

  currentChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map(row => row.dateText),
      datasets: [
        {
          label: "Total Sales",
          data: data.map(row => row.totalSales),
          tension: 0.35,
          borderWidth: 3
        },
        {
          label: "Total Ads Spend",
          data: data.map(row => row.totalAdsSpend),
          tension: 0.35,
          borderWidth: 3
        },
        {
          label: "Net Profit",
          data: data.map(row => row.profit),
          tension: 0.35,
          borderWidth: 3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          labels: {
            color: "#d9ecff"
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
            color: "#7fa7d9"
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

  tbody.innerHTML = data.map(row => {
    const profitClass = row.profit >= 0 ? "positive" : "negative";

    return `
      <tr>
        <td>${row.dateText}</td>
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

  setText("status", `Đã tải ${data.length} ngày dữ liệu`);
  setText("rangeLabel", label);
}

function filterBetweenDates(startDate, endDate) {
  const start = dateOnly(startDate);
  const end = dateOnly(endDate);

  return allData.filter(row => {
    const current = dateOnly(row.dateObj);
    return current >= start && current <= end;
  });
}

function applyRange(range) {
  const latestDate = getLatestDate(allData);

  if (range === "all" || !latestDate) {
    renderDashboard(allData, "All data");
    return;
  }

  let startDate = latestDate;
  let endDate = latestDate;
  let label = "";

  if (range === "yesterday") {
    startDate = latestDate;
    endDate = latestDate;
    label = `Yesterday: ${toInputDate(latestDate)}`;
  }

  if (range === "last3") {
    startDate = addDays(latestDate, -2);
    endDate = latestDate;
    label = `Last 3 days: ${toInputDate(startDate)} → ${toInputDate(endDate)}`;
  }

  if (range === "last7") {
    startDate = addDays(latestDate, -6);
    endDate = latestDate;
    label = `Last 7 days: ${toInputDate(startDate)} → ${toInputDate(endDate)}`;
  }

  const filteredData = filterBetweenDates(startDate, endDate);

  renderDashboard(filteredData, label);
}

function applyCustomRange() {
  const fromValue = document.getElementById("fromDate").value;
  const toValue = document.getElementById("toDate").value;

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
  const timeRange = document.getElementById("timeRange");
  const customRange = document.getElementById("customRange");
  const applyCustom = document.getElementById("applyCustom");

  if (!timeRange || !customRange || !applyCustom) return;

  timeRange.addEventListener("change", function() {
    const selectedRange = this.value;

    if (selectedRange === "custom") {
      customRange.classList.add("show");

      const latestDate = getLatestDate(allData);

      if (latestDate) {
        const latestInputDate = toInputDate(latestDate);

        document.getElementById("fromDate").value = latestInputDate;
        document.getElementById("toDate").value = latestInputDate;
      }

      setText("rangeLabel", "Custom: chọn From Date và To Date");
      return;
    }

    customRange.classList.remove("show");
    applyRange(selectedRange);
  });

  applyCustom.addEventListener("click", applyCustomRange);
}

function findHeaderIndex(rows) {
  return rows.findIndex(row => {
    const normalizedCells = row.map(cell =>
      normalizeHeader(cell).toLowerCase()
    );

    return (
      normalizedCells.includes("date") &&
      normalizedCells.includes("total orders") &&
      normalizedCells.includes("total sales")
    );
  });
}

function rowsToObjects(rows, headerIndex) {
  const headers = rows[headerIndex].map(header => normalizeHeader(header));
  const dataRows = rows.slice(headerIndex + 1);

  return dataRows.map(row => {
    const obj = {};

    headers.forEach((header, index) => {
      if (header) {
        obj[header] = row[index];
      }
    });

    return obj;
  });
}

function loadData() {
  Papa.parse(CSV_URL, {
    download: true,
    header: false,
    skipEmptyLines: true,
    complete: function(results) {
      const rows = results.data.filter(row =>
        row.some(cell => String(cell || "").trim() !== "")
      );

      const headerIndex = findHeaderIndex(rows);

      if (headerIndex === -1) {
        setText("status", "Không tìm thấy dòng header: Date / Total Orders / Total Sales");
        return;
      }

      const rawData = rowsToObjects(rows, headerIndex);

      allData = rawData
        .map(normalizeRow)
        .filter(isValidDataRow)
        .sort((a, b) => a.dateObj - b.dateObj);

      setupFilters();
      applyRange("all");
    },
    error: function(error) {
      console.error(error);
      setText("status", "Lỗi tải dữ liệu");
    }
  });
}

loadData();
