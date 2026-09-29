const fs = require("node:fs");
const { clean } = require("./core");
const { fetchText, htmlToText } = require("./sources");

const FEE_PAGE_PREFIX = "https://fundf10.eastmoney.com/jjfl_";
const FEE_CACHE_VERSION = 1;
const FEE_CACHE_DEFAULT_HOURS = 168;
const FEE_REQUEST_INTERVAL_MS = 350;
const FEE_TABLE_ANCHOR = "管理费率";
const FEE_FIELD_LABELS = {
  "管理费率": "managementFee",
  "托管费率": "custodianFee",
  "销售服务费率": "serviceFee"
};

function feePageUrl(code) {
  return `${FEE_PAGE_PREFIX}${encodeURIComponent(clean(code))}.html`;
}

function percentValue(value) {
  const match = clean(value).match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundRate(value) {
  return Math.round(value * 10000) / 10000;
}

function operationFeeTable(html) {
  const tables = String(html || "").match(/<table[\s\S]*?<\/table>/gi) || [];
  return tables.find((table) => table.includes(FEE_TABLE_ANCHOR)) || null;
}

function parseOperationFees(html) {
  const table = operationFeeTable(html);
  if (!table) return null;
  const cells = Array.from(table.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)).map((match) => htmlToText(match[1]));
  const raw = {};
  cells.forEach((cell, index) => {
    const field = FEE_FIELD_LABELS[cell];
    if (!field || Object.prototype.hasOwnProperty.call(raw, field)) return;
    if (index + 1 >= cells.length) return;
    raw[field] = cells[index + 1];
  });
  const managementFee = percentValue(raw.managementFee);
  const custodianFee = percentValue(raw.custodianFee);
  if (managementFee === null || custodianFee === null) return null;
  const reportedServiceFee = percentValue(raw.serviceFee);
  const serviceFee = reportedServiceFee === null ? 0 : reportedServiceFee;
  return {
    managementFee,
    custodianFee,
    serviceFee,
    serviceFeeReported: reportedServiceFee !== null,
    totalAnnualFee: roundRate(managementFee + custodianFee + serviceFee)
  };
}

function readFeeCache(filePath) {
  try {
    const loaded = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (loaded
      && loaded.version === FEE_CACHE_VERSION
      && loaded.byCode
      && typeof loaded.byCode === "object"
      && !Array.isArray(loaded.byCode)) return loaded;
  } catch (error) {
    return { version: FEE_CACHE_VERSION, byCode: {} };
  }
  return { version: FEE_CACHE_VERSION, byCode: {} };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function collectFeeRates(funds, options) {
  const settings = Object.assign({
    cacheHours: FEE_CACHE_DEFAULT_HOURS,
    intervalMs: FEE_REQUEST_INTERVAL_MS,
    retries: 2,
    queriedAt: new Date().toISOString()
  }, options);
  const cache = settings.cache && settings.cache.byCode
    ? settings.cache
    : { version: FEE_CACHE_VERSION, byCode: {} };
  const nowMs = new Date(settings.queriedAt).getTime();
  const maxAgeMs = Math.max(0, settings.cacheHours) * 60 * 60 * 1000;
  const codes = [...new Set((funds || [])
    .map((fund) => clean(fund && fund.code))
    .filter((code) => /^\d{6}$/.test(code)))];
  const byCode = {};
  const errors = [];
  const missing = [];
  codes.forEach((code) => {
    const cached = cache.byCode[code];
    const fetchedAt = cached ? new Date(cached.fetchedAt).getTime() : NaN;
    if (cached && cached.fee && Number.isFinite(fetchedAt) && nowMs - fetchedAt < maxAgeMs) byCode[code] = cached.fee;
    else missing.push(code);
  });
  let downloadedCount = 0;
  for (let index = 0; index < missing.length; index += 1) {
    if (index > 0 && settings.intervalMs > 0) await sleep(settings.intervalMs);
    const code = missing[index];
    const sourceUrl = feePageUrl(code);
    downloadedCount += 1;
    try {
      const html = await (settings.fetchText
        ? settings.fetchText(sourceUrl, { retries: settings.retries })
        : fetchText(sourceUrl, { retries: settings.retries }));
      const parsed = parseOperationFees(html);
      if (!parsed) throw new Error("费率页未包含运作费用表");
      const fee = Object.assign({}, parsed, { sourceUrl, fetchedAt: settings.queriedAt });
      byCode[code] = fee;
      cache.byCode[code] = { fetchedAt: settings.queriedAt, fee };
    } catch (error) {
      errors.push({ code, sourceUrl, message: error.message });
    }
  }
  return {
    byCode,
    errors,
    cache,
    diagnostics: {
      requested: codes.length,
      cacheHitCount: codes.length - missing.length,
      downloadedCount,
      resolvedCount: Object.keys(byCode).length
    }
  };
}

module.exports = {
  FEE_CACHE_DEFAULT_HOURS,
  FEE_CACHE_VERSION,
  FEE_REQUEST_INTERVAL_MS,
  collectFeeRates,
  feePageUrl,
  operationFeeTable,
  parseOperationFees,
  percentValue,
  readFeeCache
};
