const labels = { nasdaq100: "纳斯达克100", sp500: "标普500" };
const healthLabels = { ok: "数据完整", partial: "数据部分完整", degraded: "数据不完整" };
const statusLabels = { suspended: "暂停申购", unavailable: "暂不可申购" };
let payload;
let selected = "all";

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

function groupRows(rows, amountOf = finalAmount) {
  const groups = new Map();
  rows.forEach((row) => {
    const amount = amountOf(row);
    const key = [baseName(row.name), amount, row.currency, row.route].join("|");
    const group = groups.get(key) || { ...row, name: baseName(row.name), amount, codes: [] };
    if (!group.codes.includes(row.code)) group.codes.push(row.code);
    groups.set(key, group);
  });
  return [...groups.values()].sort((left, right) => {
    const leftAmount = Number.isFinite(left.amount) ? left.amount : -Infinity;
    const rightAmount = Number.isFinite(right.amount) ? right.amount : -Infinity;
    return rightAmount - leftAmount || left.name.localeCompare(right.name, "zh-CN");
  });
}

function renderTable(container, rows) {
  if (!rows.length) return;
  container.innerHTML = `<table><thead><tr><th>限额</th><th>基金</th><th>代码</th></tr></thead><tbody>${rows.map((row) => `<tr${row.displayStatus ? " class=\"paused-row\"" : ""}><td>${safe(row.displayStatus || displayAmount(row.amount, row.currency))}</td><td>${safe(row.name)}${row.route === "exchange" ? "（场内交易）" : ""}</td><td>${safe(row.codes.join("、"))}</td></tr>`).join("")}</tbody></table>`;
}

function groupUnavailableRows(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const status = finalStatus(row);
    const key = [status, baseName(row.name)].join("|");
    const group = groups.get(key) || { ...row, name: baseName(row.name), displayStatus: statusLabels[status] || status, codes: [] };
    if (!group.codes.includes(row.code)) group.codes.push(row.code);
    groups.set(key, group);
  });
  return [...groups.values()].sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
}

function render() {
  const indexes = selected === "all" ? ["nasdaq100", "sp500"] : [selected];
  const root = document.querySelector("#fund-sections");
  root.innerHTML = "";
  indexes.forEach((index) => {
    const sales = groupRows(payload.rows.filter((row) => row.index === index && row.channelBucket !== "fund-manager-direct" && ["open", "limited"].includes(finalStatus(row))));
    const unavailable = groupUnavailableRows(payload.rows.filter((row) => row.index === index && row.channelBucket !== "fund-manager-direct" && ["suspended", "unavailable"].includes(finalStatus(row))));
    const direct = groupRows(payload.officialChannelEvidence.filter((row) => row.index === index), (row) => row.amount);
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
  render();
}

start();
