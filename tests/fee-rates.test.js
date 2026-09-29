const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  collectFeeRates,
  feePageUrl,
  parseOperationFees,
  percentValue
} = require("../scripts/lib/fee-rates");
const { validateSourceTarget } = require("../scripts/lib/sources");

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");

test("parses the public operation-fee table into an annual total", () => {
  const fee = parseOperationFees(fixture("fee-page.html"));
  assert.equal(fee.managementFee, 0.8);
  assert.equal(fee.custodianFee, 0.2);
  assert.equal(fee.serviceFee, 0.3);
  assert.equal(fee.serviceFeeReported, true);
  assert.equal(fee.totalAnnualFee, 1.3);
});

test("treats an unreported service fee as zero while flagging it", () => {
  const absent = parseOperationFees("<table><tr><td>管理费率</td><td>0.50%（每年）</td><td>托管费率</td><td>0.15%（每年）</td><td>销售服务费率</td><td>---</td></tr></table>");
  assert.equal(absent.serviceFee, 0);
  assert.equal(absent.serviceFeeReported, false);
  assert.equal(absent.totalAnnualFee, 0.65);
  const omitted = parseOperationFees("<table><tr><td>管理费率</td><td>0.80%（每年）</td><td>托管费率</td><td>0.20%（每年）</td></tr></table>");
  assert.equal(omitted.serviceFee, 0);
  assert.equal(omitted.serviceFeeReported, false);
  assert.equal(omitted.totalAnnualFee, 1);
});

test("returns null instead of guessing when the fee table is unusable", () => {
  assert.equal(parseOperationFees("<div>交易状态：开放申购</div>"), null);
  assert.equal(parseOperationFees("<table><tr><td>管理费率</td><td>---</td><td>托管费率</td><td>0.20%（每年）</td></tr></table>"), null);
  assert.equal(parseOperationFees(""), null);
});

test("keeps fee page requests inside the allowed public source host", () => {
  const url = feePageUrl("019441");
  assert.equal(url, "https://fundf10.eastmoney.com/jjfl_019441.html");
  assert.equal(validateSourceTarget(url).hostname, "fundf10.eastmoney.com");
});

test("reads percentages without inventing values for missing text", () => {
  assert.equal(percentValue("0.80%（每年）"), 0.8);
  assert.equal(percentValue("1.20%"), 1.2);
  assert.equal(percentValue("---"), null);
  assert.equal(percentValue(""), null);
});

test("reuses a fresh cache and only throttles uncached codes", async () => {
  const requested = [];
  const cachedFee = { managementFee: 0.5, custodianFee: 0.15, serviceFee: 0, serviceFeeReported: true, totalAnnualFee: 0.65 };
  const result = await collectFeeRates(
    [{ code: "019441" }, { code: "019442" }],
    {
      queriedAt: "2026-07-12T06:30:00.000Z",
      intervalMs: 0,
      cache: { version: 1, byCode: { "019441": { fetchedAt: "2026-07-11T06:30:00.000Z", fee: cachedFee } } },
      fetchText: async (url) => {
        requested.push(url);
        return fixture("fee-page.html");
      }
    }
  );
  assert.deepEqual(requested, ["https://fundf10.eastmoney.com/jjfl_019442.html"]);
  assert.equal(result.byCode["019441"].totalAnnualFee, 0.65);
  assert.equal(result.byCode["019442"].totalAnnualFee, 1.3);
  assert.equal(result.diagnostics.requested, 2);
  assert.equal(result.diagnostics.cacheHitCount, 1);
  assert.equal(result.diagnostics.downloadedCount, 1);
  assert.equal(result.errors.length, 0);
});

test("degrades to a recorded error when a fee page cannot be parsed", async () => {
  const result = await collectFeeRates(
    [{ code: "019441" }],
    { queriedAt: "2026-07-12T06:30:00.000Z", intervalMs: 0, fetchText: async () => "<div>无费率</div>" }
  );
  assert.equal(result.byCode["019441"], undefined);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /运作费用表/);
});
