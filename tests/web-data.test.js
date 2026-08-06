const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

test("web data builder exports only display fields", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qdii-web-"));
  const input = path.join(directory, "input.json");
  const output = path.join(directory, "public", "latest.json");
  fs.writeFileSync(input, JSON.stringify({
    completedAt: "2026-08-06T01:10:00.000Z", timezone: "Asia/Shanghai",
    health: { status: "ok", checked: 1, expected: 1 },
    rows: [{ index: "nasdaq100", code: "001", name: "测试基金A", status: "limited", limitAmount: 100, sourceUrl: "https://private.example/token", officialNotice: { url: "https://private.example/pdf" } }],
    officialChannelEvidence: [{ index: "nasdaq100", code: "001", name: "测试基金A", amount: 200, currency: "CNY", noticeUrl: "https://private.example/pdf" }],
    changes: []
  }));
  const result = childProcess.spawnSync(process.execPath, ["scripts/build-web-data.js", "--input", input, "--output", output], { cwd: path.resolve(__dirname, ".."), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const exported = fs.readFileSync(output, "utf8");
  assert.match(exported, /测试基金A/);
  assert.doesNotMatch(exported, /private\.example|sourceUrl|officialNotice|noticeUrl/);
  assert.equal(JSON.parse(exported).rows[0].decisionLimitAmount, 100);
});
