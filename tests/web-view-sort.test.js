const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "web", "public", "app.js"), "utf8");

// web/public/app.js 是直接跑在浏览器里的脚本，没有导出任何东西。
// 这里用最小假 DOM 把它整份加载进来，再通过页面上的切换按钮验证排序结果。
function fakeElement(name) {
  return {
    name,
    _html: "",
    hidden: false,
    dataset: {},
    _attrs: {},
    _handlers: {},
    classList: {
      _set: new Set(),
      toggle(token, force) {
        if (force === undefined) this._set.has(token) ? this._set.delete(token) : this._set.add(token);
        else if (force) this._set.add(token);
        else this._set.delete(token);
      },
      add(token) { this._set.add(token); },
      remove(token) { this._set.delete(token); },
      contains(token) { return this._set.has(token); }
    },
    setAttribute(key, value) { this._attrs[key] = String(value); },
    getAttribute(key) { return this._attrs[key]; },
    addEventListener(type, handler) { this._handlers[type] = handler; },
    click() { this._handlers.click.call(this); },
    set textContent(value) { this._html = String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); },
    get textContent() { return this._html; },
    get innerHTML() { return this._html; },
    set innerHTML(value) { this._html = String(value); }
  };
}

const fee = (managementFee, custodianFee, serviceFee, total) => ({
  managementFee, custodianFee, serviceFee, serviceFeeReported: serviceFee > 0, totalAnnualFee: total
});

const payload = {
  completedAt: "2026-09-29T09:10:00+08:00",
  timezone: "Asia/Shanghai",
  health: { status: "ok", checked: 6, expected: 6 },
  feeRates: { enabled: true, checked: 6, found: 5, errors: 1 },
  rows: [
    { index: "nasdaq100", code: "000001", name: "测试纳指100ETF联接(QDII)A", decisionLimitAmount: 10, fee: fee(0.8, 0.2, 0, 1) },
    { index: "nasdaq100", code: "000002", name: "测试纳指100ETF联接(QDII)C", decisionLimitAmount: 10, fee: fee(0.8, 0.2, 0.3, 1.3) },
    { index: "nasdaq100", code: "000003", name: "测试纳指100ETF联接(QDII)人民币I", decisionLimitAmount: 10, fee: fee(0.8, 0.2, 0.1, 1.1) },
    { index: "sp500", code: "000004", name: "便宜标普500指数人民币", decisionLimitAmount: null, fee: fee(0.4, 0.1, 0, 0.5) },
    { index: "sp500", code: "000005", name: "未公示费率标普500指数", decisionLimitAmount: null, fee: null },
    { index: "sp500", code: "000006", name: "测试标普500指数(QDII-FOF)A", decisionLimitAmount: 5, fee: fee(1, 0.2, 0.3, 1.5) }
  ],
  officialChannelEvidence: []
};

function boot() {
  const nodes = {};
  ["#table-head", "#fund-list", "#data-status", "#table-card", "#updated-at", "#view-toggle", "#export-current", "#empty-hint"]
    .forEach((selector) => { nodes[selector] = fakeElement(selector); });
  const labels = [fakeElement("label-amount"), fakeElement("label-fee")];
  labels[0].dataset.view = "amount";
  labels[1].dataset.view = "fee";
  const tabs = ["nasdaq100", "sp500", "all"].map((key) => {
    const tab = fakeElement(`tab-${key}`);
    tab.dataset.index = key;
    return tab;
  });
  const context = vm.createContext({
    document: {
      createElement: () => fakeElement("span"),
      querySelector: (selector) => nodes[selector] || null,
      querySelectorAll: (selector) => (selector.includes("view-label") ? labels : selector.includes(".tab") ? tabs : [])
    },
    console,
    fetch: () => Promise.resolve({ ok: true, json: async () => payload }),
    setTimeout,
    requestAnimationFrame: (handler) => handler()
  });
  vm.runInContext(source, context);
  // 首屏渲染发生在 start() 里，必须先等它把数据挂上再做断言。
  return vm.runInContext("start()", context).then(() => ({
    run: (code) => vm.runInContext(code, context),
    toggle: nodes["#view-toggle"],
    // 首屏默认只显示纳斯达克100，先切到「全部」再看完整顺序。
    showAll: () => tabs[2].click(),
    head: () => nodes["#table-head"].innerHTML,
    codes: () => [...nodes["#fund-list"].innerHTML.matchAll(/class="code">(\d+)</g)].map((match) => match[1])
  }));
}

test("份额类别与同名分组键", async () => {
  const app = await boot();
  assert.equal(app.run('shareClassLetter("测试纳指100ETF联接(QDII)A")'), "A");
  assert.equal(app.run('shareClassLetter("建信纳斯达克100指数(QDII)C人民币")'), "C");
  assert.equal(app.run('shareClassLetter("华夏标普500ETF发起式联接(QDII)A(人民币)")'), "A");
  assert.equal(app.run('shareClassLetter("国泰纳斯达克100指数")'), "");
  // QDII-FOF 里的 F 是专有名词的一部分，不能被当成份额类别。
  assert.equal(app.run('shareClassLetter("天弘标普500发起(QDII-FOF)")'), "");
  assert.equal(app.run('groupKey("广发纳斯达克100ETF联接人民币(QDII)A")'), "广发纳斯达克100ETF联接(QDII)");
  assert.equal(app.run('groupKey("易方达纳斯达克100ETF联接(QDII-LOF)C(人民币)")'), "易方达纳斯达克100ETF联接(QDII-LOF)");
  assert.equal(app.run('groupKey("易方达标普500指数人民币A")'), app.run('groupKey("易方达标普500指数人民币C")'));
});

test("额度视图仍按额度从高到低排，并列时 A 类在前", async () => {
  const app = await boot();
  app.showAll();
  assert.deepEqual(app.codes(), ["000001", "000002", "000003", "000006", "000004", "000005"]);
});

test("费率视图按综合费率从高到低排，同名份额以 A 类为基准", async () => {
  const app = await boot();
  app.showAll();
  app.toggle.click();
  // 000006 是 1.5，最贵，排第一；000001/000002/000003 是同一只基金，基准取 A 类的 1.0，
  // 所以 C 类哪怕自身 1.3 也跟着整组排在 1.5 之后，而不是插到前面去；
  // 000004 是 0.5，未公示费率的 000005 排最后。
  assert.deepEqual(app.codes(), ["000006", "000001", "000002", "000003", "000004", "000005"]);
  assert.match(app.head(), /综合费率/);
  // 直接看排序键：已公示费率的基准必须单调不增，未公示的排在最后。
  const basis = JSON.parse(app.run('JSON.stringify(buildRows("all").map((row) => row.sortFee))'));
  const published = basis.filter((value) => value !== null);
  assert.deepEqual(published, [...published].sort((left, right) => right - left));
  assert.equal(basis[basis.length - 1], null);
});

test("切换回额度视图后恢复额度排序", async () => {
  const app = await boot();
  app.showAll();
  app.toggle.click();
  app.toggle.click();
  assert.deepEqual(app.codes(), ["000001", "000002", "000003", "000006", "000004", "000005"]);
  assert.match(app.head(), /代销/);
});

test("两种视图下同名份额都紧邻且顺序固定为 A、C、I", async () => {
  const app = await boot();
  app.showAll();
  const amountOrder = app.codes();
  app.toggle.click();
  const feeOrder = app.codes();
  [amountOrder, feeOrder].forEach((codes) => {
    assert.deepEqual(codes.slice(codes.indexOf("000001"), codes.indexOf("000001") + 3), ["000001", "000002", "000003"]);
  });
});
