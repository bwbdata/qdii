const labels = { nasdaq100: "纳斯达克100", sp500: "标普500" };
const healthLabels = { ok: "数据完整", partial: "数据部分完整", degraded: "数据不完整" };
const statusLabels = { suspended: "暂停申购", unavailable: "暂不可申购" };
let payload;
let selected = "nasdaq100";

const safe = (value) => {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
};
const displayAmount = (value, currency = "CNY") => {
  if (!Number.isFinite(value)) return "未显示上限";
  if (currency === "USD") return `${value.toLocaleString("zh-CN")} 美元`;
  return value >= 10000 && value % 10000 === 0 ? `${value / 10000} 万元` : `${value.toLocaleString("zh-CN")} 元`;
};
const finalStatus = (row) => row.decisionStatus || row.status;
const finalAmount = (row) => Number.isFinite(row.decisionLimitAmount) ? row.decisionLimitAmount : row.limitAmount;
const baseName = (name = "") => /(?:ETF|LOF|FOF)$/i.test(name) ? name : name.replace(/(?:人民币|美元现汇|美元现钞|美汇|美钞)?[A-Z](?:类)?(?:人民币|美元现汇|美元现钞|美汇|美钞|\((?:人民币|美元[^)]*)\))?$/i, "").trim();
const shareType = (name = "") => {
  const match = String(name).trim().match(/(?:人民币|美元现汇|美元现钞|美汇|美钞)?([A-Z])(?:类)?(?:人民币|美元现汇|美元现钞|美汇|美钞)?$/i);
  return match ? match[1].toUpperCase() : "";
};
const codeLabel = (row) => `${row.code}${shareType(row.name) ? `(${shareType(row.name)})` : ""}`;
const sortCodeLabels = (labels) => labels.sort((left, right) => {
  const leftType = left.match(/\(([A-Z])\)$/)?.[1] || "Z";
  const rightType = right.match(/\(([A-Z])\)$/)?.[1] || "Z";
  return leftType.localeCompare(rightType) || left.localeCompare(right, "zh-CN");
});

function groupRows(rows, amountOf = finalAmount) {
  const groups = new Map();
  rows.forEach((row) => {
    const amount = amountOf(row);
    const key = [baseName(row.name), amount, row.currency, row.route].join("|");
    const group = groups.get(key) || { ...row, name: baseName(row.name), amount, codes: [], codeLabels: [] };
    if (!group.codes.includes(row.code)) {
      group.codes.push(row.code);
      group.codeLabels.push(codeLabel(row));
    }
    groups.set(key, group);
  });
  return [...groups.values()].map((group) => {
    sortCodeLabels(group.codeLabels);
    return group;
  }).sort((left, right) => {
    const leftAmount = Number.isFinite(left.amount) ? left.amount : -Infinity;
    const rightAmount = Number.isFinite(right.amount) ? right.amount : -Infinity;
    return rightAmount - leftAmount || left.name.localeCompare(right.name, "zh-CN");
  });
}

function renderTable(container, rows) {
  if (!rows.length) return;
  container.innerHTML = `<table><thead><tr><th>限额</th><th>基金</th><th>代码</th></tr></thead><tbody>${rows.map((row) => `<tr${row.displayStatus ? " class=\"paused-row\"" : ""}><td>${safe(row.displayStatus || displayAmount(row.amount, row.currency))}</td><td>${safe(row.name)}${row.route === "exchange" ? "（场内交易）" : ""}</td><td>${(row.codeLabels || row.codes).map(safe).join("<br>")}</td></tr>`).join("")}</tbody></table>`;
}

function groupUnavailableRows(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const status = finalStatus(row);
    const key = [status, baseName(row.name)].join("|");
    const group = groups.get(key) || { ...row, name: baseName(row.name), displayStatus: statusLabels[status] || status, codes: [], codeLabels: [] };
    if (!group.codes.includes(row.code)) {
      group.codes.push(row.code);
      group.codeLabels.push(codeLabel(row));
    }
    groups.set(key, group);
  });
  return [...groups.values()].map((group) => {
    sortCodeLabels(group.codeLabels);
    return group;
  }).sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

function channelRows(index) {
  const sales = groupRows(payload.rows.filter((row) => row.index === index && row.channelBucket !== "fund-manager-direct" && ["open", "limited"].includes(finalStatus(row))));
  const unavailable = groupUnavailableRows(payload.rows.filter((row) => row.index === index && row.channelBucket !== "fund-manager-direct" && ["suspended", "unavailable"].includes(finalStatus(row))));
  const direct = groupRows(payload.officialChannelEvidence.filter((row) => row.index === index), (row) => row.amount);
  return { sales, unavailable, direct };
}

function render() {
  const indexes = selected === "all" ? ["nasdaq100", "sp500"] : [selected];
  const root = document.querySelector("#fund-sections");
  root.innerHTML = "";
  indexes.forEach((index) => {
    const { sales, unavailable, direct } = channelRows(index);
    const section = document.querySelector("#fund-section-template").content.cloneNode(true);
    const health = payload.health || {};
    const updateButton = section.querySelector(".updated-at");
    const statusPanel = section.querySelector(".data-status");
    const time = new Intl.DateTimeFormat("zh-CN", { timeZone: payload.timezone || "Asia/Shanghai", dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(new Date(payload.completedAt));
    section.querySelector("h2").textContent = labels[index];
    updateButton.textContent = `更新于 ${time}`;
    statusPanel.innerHTML = `<strong>${safe(healthLabels[health.status] || "状态未知")}</strong><span>已核验 ${health.checked || 0}/${health.expected || 0}</span>${health.status !== "ok" ? "<p>暂未确认项目不会进入限额清单。</p>" : ""}`;
    updateButton.addEventListener("click", () => {
      const expanded = updateButton.getAttribute("aria-expanded") === "true";
      updateButton.setAttribute("aria-expanded", String(!expanded));
      statusPanel.hidden = expanded;
    });
    section.querySelector(".count").textContent = `${sales.length} 只`;
    renderTable(section.querySelector(".sales-table"), sales.concat(unavailable));
    renderTable(section.querySelector(".direct-table"), direct);
    section.querySelector(".sales-empty").hidden = sales.length > 0;
    section.querySelector(".direct-empty").hidden = direct.length > 0;
    root.append(section);
  });
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
  const columnWidths = [150, 325, 175];
  context.font = "24px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  return rows.map((row) => {
    const first = row.displayStatus || displayAmount(row.amount, row.currency);
    const second = `${row.name}${row.route === "exchange" ? "（场内交易）" : ""}`;
    const columns = [first, second, (row.codeLabels || row.codes).join("\n")].map((value, column) => wrapText(context, value, columnWidths[column] - 24));
    return { row, columns, height: Math.max(54, Math.max(...columns.map((lines) => lines.length)) * 31 + 22) };
  });
}

function paginateExportRows(rows) {
  const pageHeight = 1334;
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

function renderExportPage(index, channel, rows, page, pages) {
  const width = 750;
  const height = 1334;
  const padding = 38;
  const columnWidths = [150, 325, 175];
  const channelName = channel === "sales" ? "代销" : "直销";
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  context.font = "24px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  const measured = measureExportRows(rows);
  const measuredRows = measured.map((item) => item.columns);
  const rowHeights = measured.map((item) => item.height);
  const headerHeight = 168;
  const tableHeaderHeight = 48;
  canvas.width = width * 2;
  canvas.height = height * 2;
  context.scale(2, 2);
  context.fillStyle = "#f4f7f6";
  context.fillRect(0, 0, width, height);
  roundedRect(context, padding, 24, width - padding * 2, height - 48, 24, "#ffffff");
  roundedRect(context, padding, 24, width - padding * 2, 126, 24, "#0d2b3e");
  context.fillStyle = "#71d7bf";
  context.font = "bold 16px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  context.fillText("QDII PURCHASE LIMITS", padding + 25, 59);
  context.fillStyle = "#ffffff";
  context.font = "bold 30px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  context.fillText(`${labels[index]}｜${channelName}`, padding + 25, 101);
  context.fillStyle = "#c8dfdf";
  context.font = "18px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  context.fillText(`更新于 ${new Intl.DateTimeFormat("zh-CN", { timeZone: payload.timezone || "Asia/Shanghai", dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(new Date(payload.completedAt))}`, padding + 25, 133);
  let y = headerHeight;
  const x = padding;
  context.fillStyle = "#f3f8f6";
  context.fillRect(x, y, width - padding * 2, tableHeaderHeight);
  context.fillStyle = "#637887";
  context.font = "bold 17px 'PingFang SC', 'Microsoft YaHei', sans-serif";
  ["限额", "基金", "代码"].forEach((label, column) => context.fillText(label, x + columnWidths.slice(0, column).reduce((sum, item) => sum + item, 0) + 12, y + 30));
  y += tableHeaderHeight;
  measuredRows.forEach((columns, rowIndex) => {
    const height = rowHeights[rowIndex];
    const row = rows[rowIndex];
    if (row.displayStatus) context.fillStyle = "#fffaf3";
    else context.fillStyle = "#ffffff";
    context.fillRect(x, y, width - padding * 2, height);
    context.strokeStyle = "#dce7e7";
    context.beginPath();
    context.moveTo(x, y + height);
    context.lineTo(width - padding, y + height);
    context.stroke();
    columns.forEach((lines, column) => {
      context.fillStyle = column === 0 ? (row.displayStatus ? "#b76723" : "#009b73") : column === 2 ? "#6c7d88" : "#102d3c";
      context.font = `${column === 0 || column === 1 ? "bold " : ""}18px 'PingFang SC', 'Microsoft YaHei', sans-serif`;
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
    const data = channelRows(index);
    ["sales", "direct"].forEach((channel) => {
      const rows = channel === "sales"
        ? data.sales.filter((row) => !row.displayStatus && ["open", "limited"].includes(finalStatus(row)))
        : data.direct;
      if (!rows.length) return;
      const pages = paginateExportRows(rows);
      pages.forEach((pageRows, page) => {
        const canvas = renderExportPage(index, channel, pageRows, page + 1, pages.length);
        downloadCanvas(canvas, `${labels[index]}-${channel === "sales" ? "代销" : "直销"}-${page + 1}.png`);
      });
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
