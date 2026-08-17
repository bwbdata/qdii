const labels = { nasdaq100: "纳斯达克100", sp500: "标普500" };
const healthLabels = { ok: "数据完整", partial: "数据部分完整", degraded: "数据不完整" };
const statusText = { suspended: "暂停", unavailable: "不可", limited: "限购", open: "开放" };
let payload;
let selected = "nasdaq100";

const safe = (value) => {
  const element = document.createElement("span");
  element.textContent = value;
  return element.innerHTML;
};
const shortAmount = (value) => {
  if (!Number.isFinite(value)) return "";
  if (value < 100) return String(value);
  if (value < 1000) return `${value / 100}百`;
  if (value < 10000) return `${value / 1000}千`;
  return `${value / 10000}万`;
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
    return `<div class="amount limited"><span class="num">${safe(shortAmount(row.salesAmount))}</span></div>`;
  }
  if (row.status === "suspended") return `<div class="amount paused">暂停</div>`;
  if (row.status === "unavailable") return `<div class="amount na">不可</div>`;
  return `<div class="amount none">状态未知</div>`;
}

function directCell(row) {
  if (row.directAmount === null) return `<div class="amount none">—</div>`;
  return `<div class="amount limited"><span class="num">${safe(shortAmount(row.directAmount))}</span></div>`;
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

async function exportCurrentSelection() {
  const button = document.querySelector("#export-current");
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "生成中…";
  let sheet;
  try {
    const rows = buildRows(selected);
    if (!rows.length) return;
    const name = selected === "all" ? "全部" : labels[selected];
    const time = new Intl.DateTimeFormat("zh-CN", { timeZone: payload.timezone || "Asia/Shanghai", dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(new Date(payload.completedAt));
    const health = payload.health || {};
    sheet = document.createElement("div");
    sheet.className = "export-sheet";
    sheet.innerHTML = `
      <header class="page-head">
        <h1>QDII 申购限额</h1>
        <p class="updated-at">更新于 ${time}</p>
      </header>
      <section class="data-status"><strong>${safe(healthLabels[health.status] || "状态未知")}</strong><span>已核验 ${health.checked || 0}/${health.expected || 0}</span></section>
      <section class="table-card">
        <div class="table-head">
          <span class="col-fund">基金</span>
          <span class="col-code">代码</span>
          <span class="col-amount">代销</span>
          <span class="col-amount">直销</span>
        </div>
        <div class="fund-list">${rows.map(renderRow).join("")}</div>
      </section>
      <footer>仅整理公开申购限制信息，不构成基金推荐或投资建议。</footer>
    `;
    document.body.appendChild(sheet);
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch { /* 忽略字体等待失败 */ }
    }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const canvas = await htmlToImage.toCanvas(sheet, { pixelRatio: 2, backgroundColor: "#f4f7f6" });
    downloadCanvas(canvas, `${name}-代销直销.png`);
  } catch (error) {
    console.error(error);
    alert(`导出失败：${error.message}`);
  } finally {
    if (sheet && sheet.parentNode) sheet.remove();
    button.disabled = false;
    button.textContent = original;
  }
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
