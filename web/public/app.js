const labels = { nasdaq100: "纳斯达克100", sp500: "标普500" };
const healthLabels = { ok: "数据完整", partial: "数据部分完整", degraded: "数据不完整" };
const statusText = { suspended: "暂停", unavailable: "不可", limited: "限购", open: "开放" };
let payload;
let selected = "nasdaq100";
let view = "amount";

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

// 份额类别靠后的排在后面，用于同名份额之间的固定顺序（A 类优先）。
const classRank = { A: 0, C: 1, E: 2, I: 3, F: 4, D: 5 };

// 同一只基金的各份额，名称只差结尾的类别字母，个别夹着「人民币」或「(人民币)」。
// 去掉这些写法差异后作为同名分组键。只认结尾紧跟非拉丁字符的单个大写字母，
// 免得把「天弘标普500发起(QDII-FOF)」这种以字母结尾的专有名词当成份额类别。
function shareBase(name = "") {
  return String(name)
    .replace(/[（(]\s*人民币\s*[）)]/g, "")
    .replace(/人民币/g, "")
    .replace(/[（(]\s*[）)]/g, "")
    .trim();
}

function shareClassLetter(name = "") {
  const match = shareBase(name).match(/[^A-Za-z]([A-Z])$/);
  return match ? match[1] : "";
}

function groupKey(name) {
  return shareClassLetter(name) ? shareBase(name).slice(0, -1) : shareBase(name);
}

function buildRows(index) {
  const salesRows = payload.rows.filter((row) => index === "all" || row.index === index);
  const directByCode = new Map(payload.officialChannelEvidence.map((entry) => [entry.code, entry]));
  const rows = salesRows.map((row) => {
    const direct = directByCode.get(row.code);
    const letter = shareClassLetter(row.name);
    const amount = finalAmount(row);
    return {
      index: row.index,
      code: row.code,
      name: row.name,
      base: groupKey(row.name),
      classRank: letter in classRank ? classRank[letter] : 50,
      status: finalStatus(row),
      // 数据里没有额度时字段可能是 null 也可能是缺失，统一成 null，
      // 免得 undefined 混进比较器算出 NaN 把排序打乱。
      salesAmount: Number.isFinite(amount) ? amount : null,
      directAmount: direct && Number.isFinite(direct.amount) ? direct.amount : null,
      fee: row.fee || null
    };
  });
  // 费率视图按综合费率从高到低排。同名份额共用一个排序基准，优先取 A 类的费率，
  // A 类缺失或费率未公示时退回组内费率可得的最高档份额，避免 C 类把整组往前带。
  const basisByBase = new Map();
  rows.forEach((row) => {
    const rate = row.fee && Number.isFinite(row.fee.totalAnnualFee) ? row.fee.totalAnnualFee : null;
    if (rate === null) return;
    const current = basisByBase.get(row.base);
    if (!current || row.classRank < current.classRank) basisByBase.set(row.base, { classRank: row.classRank, rate });
  });
  rows.forEach((row) => { row.sortFee = basisByBase.has(row.base) ? basisByBase.get(row.base).rate : null; });

  // 同名份额之间按分组键排序，而不是按原始名称：名称里「人民币」偶尔插在类别字母前面，
  // 直接比字符串会把同一只基金的份额拆散。分组键相同再按类别（A 优先）和代码定序。
  const byGroupThenClass = (left, right) => left.base.localeCompare(right.base, "zh-CN") || left.classRank - right.classRank || left.code.localeCompare(right.code);
  const amountKey = (row) => (row.salesAmount === null ? -Infinity : row.salesAmount);
  // 费率未公示的份额排在最后：降序时用 -Infinity 当键，不会跑到有费率的份额前面。
  const feeKey = (row) => (Number.isFinite(row.sortFee) ? row.sortFee : -Infinity);
  return rows.sort(view === "fee"
    ? (left, right) => feeKey(right) - feeKey(left) || byGroupThenClass(left, right)
    : (left, right) => amountKey(right) - amountKey(left) || byGroupThenClass(left, right));
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

const rateText = (value) => (Number.isFinite(value) ? `${value.toFixed(2)}%` : "未公示");
const feeTitle = (fee) => [
  `管理费 ${rateText(fee.managementFee)}`,
  `托管费 ${rateText(fee.custodianFee)}`,
  fee.serviceFeeReported ? `销售服务费 ${rateText(fee.serviceFee)}` : "销售服务费未公示",
  "每年，已从基金净值中扣除"
].join("｜");

function feeCell(row) {
  const fee = row.fee;
  if (!fee || !Number.isFinite(fee.totalAnnualFee)) return `<div class="fee none">—</div>`;
  return `<div class="fee" title="${safe(feeTitle(fee))}"><span class="num">${safe(fee.totalAnnualFee.toFixed(2))}%</span></div>`;
}

function rowClass(row) {
  if (row.status === "unavailable") return " unavailable";
  if (row.status === "suspended") return " paused";
  return "";
}

function renderRow(row) {
  const trailing = view === "fee"
    ? `<div class="col-fee">${feeCell(row)}</div>`
    : `<div class="col-amount">${salesCell(row)}</div>
    <div class="col-amount">${directCell(row)}</div>`;
  return `<div class="fund-row${rowClass(row)}">
    <div class="col-fund"><div class="fund-name">${safe(displayName(row.name))}</div></div>
    <div class="col-code"><span class="code">${safe(row.code)}</span></div>
    ${trailing}
  </div>`;
}

// 标题跟着视图走：费率视图下页面主标题换成「费率总览」。
const pageTitles = { amount: "QDII 申购限额", fee: "QDII 费率总览" };
const titleFor = (target) => pageTitles[target] || pageTitles.amount;

function applyViewToggle() {
  const toggle = document.querySelector("#view-toggle");
  document.querySelectorAll("#view-toggle .view-label").forEach((label) => {
    label.classList.toggle("active", label.dataset.view === view);
  });
  toggle.setAttribute("aria-label", `当前按${view === "fee" ? "综合费率" : "申购额度"}显示，点击切换`);
  const title = document.querySelector("#page-title");
  if (title) title.textContent = titleFor(view);
}

function headCells() {
  const head = view === "fee"
    ? `<span class="col-fee" title="按综合费率从高到低排序，同名份额以 A 类费率为基准">综合费率</span>`
    : `<span class="col-amount">代销</span>
    <span class="col-amount">直销</span>`;
  return `<span class="col-fund">基金</span>
    <span class="col-code">代码</span>
    ${head}`;
}

function render() {
  const rows = buildRows(selected);
  applyViewToggle();
  document.querySelector("#table-head").innerHTML = headCells();
  document.querySelector("#table-card").classList.toggle("view-fee", view === "fee");
  document.querySelector("#fund-list").innerHTML = rows.map(renderRow).join("");
  document.querySelector("#empty-hint").hidden = rows.length > 0;

  const health = payload.health || {};
  const feeRates = payload.feeRates || {};
  const feeNote = view === "fee" && feeRates.errors > 0 ? `<p>${safe(feeRates.errors)} 只基金的运作费率暂未取得，费率一列留空。</p>` : "";
  const statusPanel = document.querySelector("#data-status");
  const time = new Intl.DateTimeFormat("zh-CN", { timeZone: payload.timezone || "Asia/Shanghai", dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(new Date(payload.completedAt));
  document.querySelector("#updated-at").textContent = `更新于 ${time}`;
  statusPanel.innerHTML = `<strong>${safe(healthLabels[health.status] || "状态未知")}</strong><span>已核验 ${health.checked || 0}/${health.expected || 0}</span>${health.status !== "ok" ? "<p>暂未确认项目不会进入限额清单。</p>" : ""}${feeNote}`;
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
        <h1>${safe(titleFor(view))}</h1>
        <p class="updated-at">更新于 ${time}</p>
      </header>
      <section class="data-status"><strong>${safe(healthLabels[health.status] || "状态未知")}</strong><span>已核验 ${health.checked || 0}/${health.expected || 0}</span></section>
      <section class="table-card${view === "fee" ? " view-fee" : ""}">
        <div class="table-head">${headCells()}</div>
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
    downloadCanvas(canvas, `${name}-${view === "fee" ? "综合费率" : "代销直销"}.png`);
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
  document.querySelector("#view-toggle").addEventListener("click", () => {
    view = view === "fee" ? "amount" : "fee";
    render();
  });
  document.querySelector("#export-current").addEventListener("click", exportCurrentSelection);
  render();
}

start();
