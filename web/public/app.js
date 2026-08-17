const labels = { nasdaq100: "纳斯达克100", sp500: "标普500" };
const healthLabels = { ok: "数据完整", partial: "数据部分完整", degraded: "数据不完整" };
const statusText = { suspended: "暂停申购", unavailable: "暂不可申购", limited: "限购", open: "开放" };
let payload;
let selected = "nasdaq100";

const safe = (value) => {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
};
const displayAmount = (value, currency = "CNY") => {
  if (!Number.isFinite(value)) return "";
  if (currency === "USD") return `${value.toLocaleString("zh-CN")} 美元`;
  return value >= 10000 && value % 10000 === 0 ? `${value / 10000} 万元` : `${value.toLocaleString("zh-CN")} 元`;
};
const finalStatus = (row) => row.decisionStatus || row.status;
const finalAmount = (row) => (Number.isFinite(row.decisionLimitAmount) ? row.decisionLimitAmount : row.limitAmount);
const displayName = (name = "") => String(name).replace(/人民币/g, "").replace(/\(\)|（）/g, "");

function buildRows(index) {
  const salesRows = payload.rows.filter((row) => index === "all" || row.index === index);
  const directByCode = new Map(payload.officialChannelEvidence.map((entry) => [entry.code, entry]));
  return salesRows.map((row) => {
    const direct = directByCode.get(row.code);
    return {
      index: row.index,
      code: row.code,
      name: row.name,
      status: finalStatus(row),
      salesAmount: finalAmount(row),
      directAmount: direct && Number.isFinite(direct.amount) ? direct.amount : null
    };
  }).sort((left, right) => {
    const leftAmount = left.salesAmount === null ? -Infinity : left.salesAmount;
    const rightAmount = right.salesAmount === null ? -Infinity : right.salesAmount;
    return rightAmount - leftAmount || left.name.localeCompare(right.name, "zh-CN");
  });
}

function salesCell(row) {
  if (row.salesAmount !== null) {
    return `<div class="amount limited"><span class="num">${safe(row.salesAmount.toLocaleString("zh-CN"))}</span><span class="unit">元</span></div>`;
  }
  if (row.status === "suspended") return `<div class="amount paused">暂停申购</div>`;
  if (row.status === "unavailable") return `<div class="amount na">暂不可申购</div>`;
  return `<div class="amount none">状态未知</div>`;
}

function directCell(row) {
  if (row.directAmount === null) return `<div class="amount none">—</div>`;
  return `<div class="amount limited"><span class="num">${safe(row.directAmount.toLocaleString("zh-CN"))}</span><span class="unit">元</span></div>`;
}

function rowClass(row) {
  if (row.status === "unavailable") return " unavailable";
  if (row.status === "suspended") return " paused";
  return "";
}

function renderRow(row) {
  return `<div class="fund-row${rowClass(row)}">
    <div class="col-fund"><div class="fund-name">${safe(displayName(row.name))}</div></div>
    <div class="col-code"><span class="code">${safe(row.code)}</span></div>
    <div class="col-amount">${salesCell(row)}</div>
    <div class="col-amount">${directCell(row)}</div>
  </div>`;
}

function render() {
  const rows = buildRows(selected);
  document.querySelector("#fund-list").innerHTML = rows.map(renderRow).join("");
  document.querySelector("#empty-hint").hidden = rows.length > 0;

  const health = payload.health || {};
  const statusPanel = document.querySelector("#data-status");
  const time = new Intl.DateTimeFormat("zh-CN", { timeZone: payload.timezone || "Asia/Shanghai", dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(new Date(payload.completedAt));
  document.querySelector("#updated-at").textContent = `更新于 ${time}`;
  statusPanel.innerHTML = `<strong>${safe(healthLabels[health.status] || "状态未知")}</strong><span>已核验 ${health.checked || 0}/${health.expected || 0}</span>${health.status !== "ok" ? "<p>暂未确认项目不会进入限额清单。</p>" : ""}`;
  statusPanel.hidden = false;
}

function roundedRect(context, x, y, width, height, radius, fill) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
}

function wrapText(context, value, maxWidth) {
  const lines = [];
  String(value || "").split("\n").forEach((paragraph) => {
    let line = "";
    for (const character of paragraph) {
      const next = line + character;
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line);
        line = character;
      } else line = next;
    }
    lines.push(line);
  });
  return lines.length ? lines : [""];
}

function measureExportRows(rows) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const columnWidths = [250, 110, 100, 100];
  context.font = "24px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  return rows.map((row) => {
    const first = displayName(row.name);
    const second = row.code;
    const third = salesCellPlain(row);
    const fourth = directCellPlain(row);
    const columns = [first, second, third, fourth].map((value, column) => wrapText(context, value, columnWidths[column] - 24));
    return { row, columns, height: Math.max(54, Math.max(...columns.map((lines) => lines.length)) * 31 + 22) };
  });
}

function salesCellPlain(row) {
  if (row.salesAmount !== null) return `${row.salesAmount.toLocaleString("zh-CN")} 元`;
  if (row.status === "suspended") return "暂停申购";
  if (row.status === "unavailable") return "暂不可申购";
  return "状态未知";
}

function directCellPlain(row) {
  if (row.directAmount === null) return "—";
  return `${row.directAmount.toLocaleString("zh-CN")} 元`;
}

function paginateExportRows(rows) {
  const pageHeight = 1000;
  const availableHeight = pageHeight - 168 - 48 - 58;
  const pages = [];
  let current = [];
  let usedHeight = 0;
  measureExportRows(rows).forEach((item) => {
    if (current.length && usedHeight + item.height > availableHeight) {
      pages.push(current.map((entry) => entry.row));
      current = [];
      usedHeight = 0;
    }
    current.push(item);
    usedHeight += item.height;
  });
  if (current.length) pages.push(current.map((entry) => entry.row));
  return pages;
}

function renderExportPage(index, rows, page, pages) {
  const width = 750;
  const height = 1000;
  const padding = 38;
  const columnWidths = [250, 110, 100, 100];
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = "24px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  const measured = measureExportRows(rows);
  const measuredRows = measured.map((item) => item.columns);
  const rowHeights = measured.map((item) => item.height);
  const headerHeight = 168;
  const tableHeaderHeight = 48;
  canvas.width = 1080;
  canvas.height = 1440;
  context.scale(canvas.width / width, canvas.height / height);
  context.fillStyle = "#f4f7f6";
  context.fillRect(0, 0, width, height);
  roundedRect(context, padding, 24, width - padding * 2, height - 48, 24, "#ffffff");
  roundedRect(context, padding, 24, width - padding * 2, 126, 24, "#ffffff");
  context.fillStyle = "#009b73";
  context.font = "bold 16px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  context.fillText("QDII PURCHASE LIMITS", padding + 25, 59);
  context.fillStyle = "#102d3c";
  context.font = "bold 30px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  context.fillText(`${labels[index] || "全部"}｜代销 / 直销限额`, padding + 25, 101);
  context.fillStyle = "#6c7d88";
  context.font = "18px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  context.fillText(`更新于 ${new Intl.DateTimeFormat("zh-CN", { timeZone: payload.timezone || "Asia/Shanghai", dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(new Date(payload.completedAt))}`, padding + 25, 133);
  let y = headerHeight;
  const x = padding;
  context.fillStyle = "#f0f6f4";
  context.fillRect(x, y, width - padding * 2, tableHeaderHeight);
  context.fillStyle = "#637887";
  context.font = "bold 17px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ["基金", "代码", "代销", "直销"].forEach((label, column) => context.fillText(label, x + columnWidths.slice(0, column).reduce((sum, item) => sum + item, 0) + 12, y + 30));
  y += tableHeaderHeight;
  measuredRows.forEach((columns, rowIndex) => {
    const height = rowHeights[rowIndex];
    context.fillStyle = "#ffffff";
    context.fillRect(x, y, width - padding * 2, height);
    context.strokeStyle = "#dce7e7";
    context.beginPath();
    context.moveTo(x, y + height);
    context.lineTo(width - padding, y + height);
    context.stroke();
    columns.forEach((lines, column) => {
      context.fillStyle = column === 0 ? "#102d3c" : "#009b73";
      context.font = `${column === 0 ? "bold " : ""}18px 'PingFang SC', 'Microsoft YaHei', sans-serif`;
      const cellX = x + columnWidths.slice(0, column).reduce((sum, item) => sum + item, 0) + 12;
      lines.forEach((line, lineIndex) => context.fillText(line, cellX, y + 29 + lineIndex * 31));
    });
    y += height;
  });
  context.fillStyle = "#8a9a9f";
  context.font = "16px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  context.fillText(`第 ${page}/${pages} 页 · 仅供信息查询，不构成投资建议`, padding + 16, height - 22);
  return canvas;
}

function downloadCanvas(canvas, filename) {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  }, "image/png");
}

function exportCurrentSelection() {
  const indexes = selected === "all" ? ["nasdaq100", "sp500"] : [selected];
  indexes.forEach((index) => {
    const rows = buildRows(index);
    if (!rows.length) return;
    const pages = paginateExportRows(rows);
    pages.forEach((pageRows, page) => {
      const canvas = renderExportPage(index, pageRows, page + 1, pages.length);
      downloadCanvas(canvas, `${labels[index] || "全部"}-代销直销-${page + 1}.png`);
    });
  });
}

async function start() {
  try {
    payload = await fetch("./data/latest.json", { cache: "no-store" }).then((response) => {
      if (!response.ok) throw new Error("数据文件不可用");
      return response.json();
    });
  } catch {
    return;
  }
  document.querySelectorAll(".tab").forEach((button) => button.addEventListener("click", () => {
    selected = button.dataset.index;
    document.querySelectorAll(".tab").forEach((item) => item.classList.toggle("active", item === button));
    render();
  }));
  document.querySelector("#export-current").addEventListener("click", exportCurrentSelection);
  render();
}

start();
