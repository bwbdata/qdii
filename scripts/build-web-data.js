#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function argument(flag, fallback) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${flag} 缺少参数`);
  return value;
}

function publicRow(row) {
  return { index: row.index, code: row.code, name: row.name, channel: row.channel, channelBucket: row.channelBucket, channelType: row.channelType, currency: row.currency || "CNY", route: row.route || "otc", status: row.status, limitAmount: row.limitAmount, decisionStatus: row.decisionStatus || row.status, decisionLimitAmount: Number.isFinite(row.decisionLimitAmount) ? row.decisionLimitAmount : row.limitAmount };
}

function main() {
  const input = path.resolve(argument("--input", ".qdii-purchase-limits/latest.json"));
  const output = path.resolve(argument("--output", "web/public/data/latest.json"));
  const payload = JSON.parse(fs.readFileSync(input, "utf8"));
  const publicPayload = {
    schemaVersion: 1, completedAt: payload.completedAt || payload.queriedAt, timezone: payload.timezone || "Asia/Shanghai", selection: payload.selection || { index: "all" }, health: payload.health || { status: "degraded", checked: 0, expected: 0 },
    rows: (payload.rows || []).map(publicRow),
    officialChannelEvidence: (payload.officialChannelEvidence || []).map((row) => ({ index: row.index, code: row.code, name: row.name, amount: row.amount, currency: row.currency || "CNY" })),
    changesEvaluated: payload.changesEvaluated === true,
    changes: (payload.changes || []).map((change) => ({ type: change.type, before: change.before && publicRow(change.before), after: change.after && publicRow(change.after) }))
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(publicPayload, null, 2)}\n`);
  process.stdout.write(`已生成公开 H5 数据：${output}\n`);
}

try { main(); } catch (error) { process.stderr.write(`生成 H5 数据失败：${error.message}\n`); process.exitCode = 1; }
