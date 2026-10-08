const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { verifyWebData, readAndVerify, DEFAULT_MAX_AGE_HOURS } = require("../scripts/verify-web-data");

const NOW = "2026-10-08T02:00:00.000Z";
const row = (code) => ({ index: "nasdaq100", code, name: `测试基金${code}` });
const payload = (overrides) => Object.assign({
  schemaVersion: 1,
  completedAt: "2026-10-08T01:45:00.000Z",
  health: { status: "ok", checked: 2, expected: 2 },
  rows: [row("000001"), row("000002")]
}, overrides);
const check = (overrides) => verifyWebData(payload(overrides), { now: NOW });

test("正常数据通过校验", () => {
  const result = check({});
  assert.deepEqual(result.errors, []);
  assert.equal(result.warnings.length, 0);
});

test("根节点必须是 JSON 对象", () => {
  assert.match(verifyWebData([], { now: NOW }).errors[0], /根节点/);
  assert.match(verifyWebData(null, { now: NOW }).errors[0], /根节点/);
  assert.match(verifyWebData("{}", { now: NOW }).errors[0], /根节点/);
});

test("schemaVersion 不是 1 时拒绝", () => {
  assert.match(check({ schemaVersion: 2 }).errors[0], /schemaVersion 必须为 1/);
  assert.match(check({ schemaVersion: undefined }).errors[0], /schemaVersion 必须为 1/);
});

test("rows 必须是非空数组", () => {
  assert.match(check({ rows: [] }).errors[0], /rows 必须是非空数组/);
  assert.match(check({ rows: undefined }).errors[0], /rows 必须是非空数组/);
});

test("行内缺少必要字段时报出具体位置", () => {
  const result = check({ rows: [row("000001"), { index: "sp500", name: "缺代码" }] });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /rows\[1\] 缺少 code/);
});

test("行不是对象时单独报错且不中断其它检查", () => {
  const result = check({ rows: [null, row("000002")] });
  assert.match(result.errors[0], /rows\[0\] 不是对象/);
});

test("completedAt 必须是合法时间", () => {
  assert.match(check({ completedAt: "昨天" }).errors[0], /completedAt 不是合法时间/);
  assert.match(check({ completedAt: undefined }).errors[0], /completedAt 不是合法时间/);
});

test("数据超过时效上限时拒绝，未超过时通过", () => {
  // 边界：恰好等于上限不算过期（判断用 >）。
  const edge = check({ completedAt: new Date(new Date(NOW).getTime() - DEFAULT_MAX_AGE_HOURS * 3600000).toISOString() });
  assert.deepEqual(edge.errors, []);

  const stale = check({ completedAt: new Date(new Date(NOW).getTime() - (DEFAULT_MAX_AGE_HOURS + 1) * 3600000).toISOString() });
  assert.equal(stale.errors.length, 1);
  assert.match(stale.errors[0], /数据已过期/);
});

test("时效上限可由调用方覆盖", () => {
  const completedAt = new Date(new Date(NOW).getTime() - 5 * 3600000).toISOString();
  assert.deepEqual(verifyWebData(payload({ completedAt }), { now: NOW, maxAgeHours: 6 }).errors, []);
  assert.match(verifyWebData(payload({ completedAt }), { now: NOW, maxAgeHours: 4 }).errors[0], /数据已过期/);
});

test("缺少 health 视为结构错误，完整度不是 ok 只提示不拦截", () => {
  assert.match(check({ health: undefined }).errors[0], /缺少 health 字段/);

  const partial = check({ health: { status: "partial", checked: 1, expected: 2 } });
  assert.deepEqual(partial.errors, []);
  assert.match(partial.warnings[0], /数据完整度为 partial/);
});

test("费率未取得只提示，不影响发布", () => {
  const result = check({ feeRates: { enabled: true, checked: 2, found: 1, errors: 1 } });
  assert.deepEqual(result.errors, []);
  assert.match(result.warnings[0], /1 只基金的运作费率未取得/);
});

test("文件不存在或不是合法 JSON 时给出可读错误", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qdii-verify-"));
  try {
    assert.match(readAndVerify(path.join(directory, "missing.json")).errors[0], /无法读取/);

    const broken = path.join(directory, "broken.json");
    fs.writeFileSync(broken, "{ 不是 JSON");
    assert.match(readAndVerify(broken).errors[0], /不是合法 JSON/);

    const good = path.join(directory, "good.json");
    fs.writeFileSync(good, JSON.stringify(payload({})));
    const result = readAndVerify(good, { now: NOW });
    assert.deepEqual(result.errors, []);
    assert.match(result.summary, /2 只基金/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
