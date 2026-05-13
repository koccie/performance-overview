const CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSexO0zuj22HikxPvejxlLq1xc6OxgcMKavxvfcrZjUBo3DmzK20_pMVzINDWzUOSC_FZ6-sf10H3bN/pub?gid=1575530320&single=true&output=csv";

function cleanNumber(value) {
  if (value === undefined || value === null) return 0;

  return Number(
    String(value)
      .replace(/\$/g, "")
      .replace(/,/g, "")
      .replace(/%/g, "")
      .trim()
  ) || 0;
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
  const orders = cleanNumber(getValue(row, ["Total Orders", "Orders", "orders"]));
  const sales = cleanNumber(getValue(row, ["Total Sales", "Sales", "Revenue", "revenue"]));
  const ads = cleanNumber(getValue(row, ["Total Ads Spend", "Ads Spend", "Total Ads", "ads"]));
  const roas = cleanNumber(getValue(row, ["ROAS", "roas"]));
  const profit = cleanNumber(getValue(row, ["Profit", "Net Profit", "profit"]));

  return {
    date,
    orders,
    sales,
    ads,
    roas,
    profit
  };
}

function isValidDataRow(row) {
  if (!row.date) return false;
  if (String(row.date).toLowerCase().includes("total")) return false;
  return true;
}

function updateKPIs(data) {
  const totalOrders = data.reduce((sum, row) => sum + row.orders, 0);
  const totalSales = data.reduce((sum, row) => sum + row.sales, 0);
  const totalAds = data.reduce((sum, row) => sum + row.ads, 0);
  const totalProfit = data.reduce((sum, row) => sum + row.profit, 0);

  const roas = totalAds > 0 ? totalSales / totalAds : 0;
  const aov = totalOrders > 0 ? totalSales / totalOrders : 0;
  const adsPercent = totalSales > 0 ? totalAds / totalSales * 100 : 0;

  document.getElementById("totalOrders").textContent = formatNumber(totalOrders);
  document.getElementById("totalSales").textContent = formatMoney(totalSales);
  document.getElementById("totalAds").textContent = formatMoney(totalAds);
  document.getElementById("roas").textContent = `${roas.toFixed(2)}x`;
  document.getElementById("profit").textContent = formatMoney(totalProfit);
  document.getElementById("aov").textContent = formatMoney(aov);
  document.getElementById("adsPercent").textContent = formatPercent(adsPercent);

  document.getElementById("profit").className = totalProfit >= 0 ? "positive" : "negative";
}

function renderChart(data) {
  const ctx = document.getElementById("performanceChart");

  new Chart(ctx, {
    type: "line",
    data: {
      labels: data.map(row => row.date),
      datasets: [
        {
          label: "Sales",
          data: data.map(row => row.sales),
          tension: 0.35
        },
        {
          label: "Ads Spend",
          data: data.map(row => row.ads),
          tension: 0.35
        },
        {
          label: "Profit",
          data: data.map(row => row.profit),
          tension: 0.35
        }
      ]
    },
    options: {
      responsive: true,
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
            color: "#7fa7d9"
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
      </tr>
    `;
  }).join("");
}

function loadData() {
  Papa.parse(CSV_URL, {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      const data = results.data
        .map(normalizeRow)
        .filter(isValidDataRow);

      updateKPIs(data);
      renderChart(data);
      renderTable(data);

      document.getElementById("status").textContent = `Đã tải ${data.length} ngày dữ liệu`;
    },
    error: function(error) {
      console.error(error);
      document.getElementById("status").textContent = "Lỗi tải dữ liệu";
    }
  });
}

loadData();
