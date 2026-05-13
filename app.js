const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSexO0zuj22HikxPvejxlLq1xc6OxgcMKavxvfcrZjUBo3DmzK20_pMVzINDWzUOSC_FZ6-sf10H3bN/pubhtml?gid=1575530320&single=true";

let allData = [];
let currentChart = null;

function cleanNumber(value) {
  if (value === undefined || value === null) return 0;

  const cleaned = String(value)
    .replace(/\$/g, "")
    .replace(/,/g, "")
    .replace(/%/g, "")
    .replace(/\s/g, "")
    .trim();

  if (cleaned === "" || cleaned === "-") return 0;

  return Number(cleaned) || 0;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value) {
  return `${value.toFixed(1)}%`;
}

function getValue(row, possibleNames) {
  for (const name of possibleNames) {
    if (row[name] !== undefined) return row[name];
  }
  return "";
}

function normalizeRow(row) {
  const date = getValue(row, ["Date", "date", "Ngày"]);

  const orders = cleanNumber(getValue(row, [
    "Total Orders",
    "Orders",
    "orders"
  ]));

  const sales = cleanNumber(getValue(row, [
    "Total Sales",
    "Sales",
    "Revenue",
    "revenue"
  ]));

  const ads = cleanNumber(getValue(row, [
    "Total Ads Spend",
    "Ads Spend",
    "Total Ads",
    "ads"
  ]));

  const roas = cleanNumber(getValue(row, [
    "ROAS",
    "roas"
  ]));

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
    date,
    orders,
    sales,
    ads,
    roas,
    profit,
    apiCost,
    fulfillCost,
    fixedCost
  };
}

function isValidDataRow(row) {
  if (!row.date) return false;

  const dateText = String(row.date).toLowerCase().trim();

  if (dateText.includes("total")) return false;
  if (dateText.includes("date")) return false;
  if (dateText.includes("daily overview")) return false;

  return true;
}

function parseDate(value) {
  if (!value) return null;

  const raw = String(value).trim();

  let date = new Date(raw);
  if (!isNaN(date.getTime())) return date;

  const parts = raw.split(/[\/\-]/);

  if (parts.length === 3) {
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    const c = Number(parts[2]);

    if (String(parts[0]).length === 4) {
      date = new Date(a, b - 1, c);
    } else {
      date = new Date(c, b - 1, a);
    }

    if (!isNaN(date.getTime())) return date;
  }

  return null;
}

function dateOnly(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

function getLatestDate(data) {
  const dates = data
    .map(row => parseDate(row.date))
    .filter(Boolean)
    .map(dateOnly)
    .sort((a, b) => b - a);

  return dates[0] || null;
}

function updateKPIs(data) {
  const totalOrders = data.reduce((sum, row) => sum + row.orders, 0);
  const totalSales = data.reduce((sum, row) => sum + row.sales, 0);
  const totalAds = data.reduce((sum, row) => sum + row.ads, 0);
  const totalProfit = data.reduce((sum, row) => sum + row.profit, 0);
  const totalApiCost = data.reduce((sum, row) => sum + row.apiCost, 0);
  const totalFulfillCost = data.reduce((sum, row) => sum + row.fulfillCost, 0);
  const totalFixedCost = data.reduce((sum, row) => sum + row.fixedCost, 0);

  const roas = totalAds > 0 ? totalSales / totalAds : 0;
  const aov = totalOrders > 0 ? totalSales / totalOrders : 0;
  const adsPercent = totalSales > 0 ? totalAds / totalSales * 100 : 0;
  const apiPercent = totalSales > 0 ? totalApiCost / totalSales * 100 : 0;
  const fulfillPercent = totalSales > 0 ? totalFulfillCost / totalSales * 100 : 0;

  document.getElementById("totalOrders").textContent = formatNumber(totalOrders);
  document.getElementById("totalSales").textContent = formatMoney(totalSales);
  document.getElementById("totalAds").textContent = formatMoney(totalAds);
  document.getElementById("roas").textContent = `${roas.toFixed(2)}x`;
  document.getElementById("profit").textContent = formatMoney(totalProfit);
  document.getElementById("aov").textContent = formatMoney(aov);
  document.getElementById("adsPercent").textContent = formatPercent(adsPercent);
  document.getElementById("apiPercent").textContent = formatPercent(apiPercent);
  document.getElementById("fulfillPercent").textContent = formatPercent(fulfillPercent);
  document.getElementById("totalApiCost").textContent = formatMoney(totalApiCost);
  document.getElementById("totalFulfillCost").textContent = formatMoney(totalFulfillCost);
  document.getElementById("totalFixedCost").textContent = formatMoney(totalFixedCost);

  document.getElementById("profit").className = totalProfit >= 0 ? "positive" : "negative";
}

function renderChart(data) {
  const ctx = document.getElementById("performanceChart");

  if (currentChart) {
    currentChart.destroy();
  }

  currentChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map(row => row.date),
      datasets: [
        {
          label: "Sales",
          data: data.map(row => row.sales),
          tension: 0.35,
          borderWidth: 3
        },
        {
          label: "Ads Spend",
          data: data.map(row => row.ads),
          tension: 0.35,
          borderWidth: 3
        },
        {
          label: "Profit",
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

  tbody.innerHTML = data.map(row => {
    const profitClass = row.profit >= 0 ? "positive" : "negative";

    return `
      <tr>
        <td>${row.date}</td>
        <td>${formatNumber(row.orders)}</td>
        <td>${formatMoney(row.sales)}</td>
        <td>${formatMoney(row.ads)}</td>
        <td>${row.roas.toFixed(2)}x</td>
        <td class="${profitClass}">${formatMoney(row.profit)}</td>
        <td>${formatMoney(row.apiCost)}</td>
        <td>${formatMoney(row.fulfillCost)}</td>
        <td>${formatMoney(row.fixedCost)}</td>
      </tr>
    `;
  }).join("");
}

function renderDashboard(data, label = "All data") {
  updateKPIs(data);
  renderChart(data);
  renderTable(data);

  document.getElementById("status").textContent = `Đã tải ${data.length} ngày dữ liệu`;
  document.getElementById("rangeLabel").textContent = label;
}

function filterByRange(range) {
  const latestDate = getLatestDate(allData);

  if (!latestDate || range === "all") {
    renderDashboard(allData, "All data");
    return;
  }

  let startDate;
  const endDate = new Date(latestDate);

  if (range === "yesterday") {
    startDate = new Date(latestDate);
  }

  if (range === "last3") {
    startDate = new Date(latestDate);
    startDate.setDate(startDate.getDate() - 2);
  }

  if (range === "last7") {
    startDate = new Date(latestDate);
    startDate.setDate(startDate.getDate() - 6);
  }

  startDate = dateOnly(startDate);

  const filtered = allData.filter(row => {
    const rowDate = parseDate(row.date);
    if (!rowDate) return false;

    const current = dateOnly(rowDate);
    return current >= startDate && current <= endDate;
  });

  const labelMap = {
    yesterday: "Yesterday",
    last3: "Last 3 days",
    last7: "Last 7 days"
  };

  renderDashboard(filtered, labelMap[range]);
}

function filterCustomRange() {
  const startValue = document.getElementById("startDate").value;
  const endValue = document.getElementById("endDate").value;

  if (!startValue || !endValue) {
    document.getElementById("status").textContent = "Vui lòng chọn đủ Start Date và End Date";
    return;
  }

  const startDate = dateOnly(new Date(startValue));
  const endDate = dateOnly(new Date(endValue));

  const filtered = allData.filter(row => {
    const rowDate = parseDate(row.date);
    if (!rowDate) return false;

    const current = dateOnly(rowDate);
    return current >= startDate && current <= endDate;
  });

  renderDashboard(filtered, `${startValue} → ${endValue}`);
}

function setupFilters() {
  const buttons = document.querySelectorAll(".filter-btn");
  const customRange = document.getElementById("customRange");

  buttons.forEach(button => {
    button.addEventListener("click", function() {
      buttons.forEach(btn => btn.classList.remove("active"));
      this.classList.add("active");

      const range = this.dataset.range;

      if (range === "custom") {
        customRange.classList.add("show");

        const latestDate = getLatestDate(allData);
        if (latestDate) {
          document.getElementById("startDate").value = formatDateInput(latestDate);
          document.getElementById("endDate").value = formatDateInput(latestDate);
        }

        return;
      }

      customRange.classList.remove("show");
      filterByRange(range);
    });
  });

  document.getElementById("applyCustom").addEventListener("click", filterCustomRange);
}

function findHeaderIndex(rows) {
  return rows.findIndex(row => {
    const normalizedCells = row.map(cell => String(cell).trim().toLowerCase());

    return (
      normalizedCells.includes("date") &&
      normalizedCells.includes("total orders") &&
      normalizedCells.includes("total sales")
    );
  });
}

function rowsToObjects(rows, headerIndex) {
  const headers = rows[headerIndex].map(header => String(header).trim());
  const dataRows = rows.slice(headerIndex + 1);

  return dataRows.map(row => {
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = row[index];
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
      const rows = results.data;

      const headerIndex = findHeaderIndex(rows);

      if (headerIndex === -1) {
        document.getElementById("status").textContent = "Không tìm thấy dòng header: Date / Total Orders / Total Sales";
        return;
      }

      const rawData = rowsToObjects(rows, headerIndex);

      allData = rawData
        .map(normalizeRow)
        .filter(isValidDataRow);

      renderDashboard(allData, "All data");
      setupFilters();
    },
    error: function(error) {
      console.error(error);
      document.getElementById("status").textContent = "Lỗi tải dữ liệu";
    }
  });
}

loadData();
