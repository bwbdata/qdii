#!/usr/bin/env node
// 校验准备发布的 H5 数据文件。
//
// 这份数据由极狐（jihulab）侧的 CI 定时生成，GitHub Actions 取回来直接发布上线，
// 中间没有人工确认环节。所以入口需要一道守门：文件不是合法 JSON、结构不完整，
// 或者数据已经过期，都必须让发布失败。
//
// 「过期」这条不是多余的：上游 CI 停掉之后，GitLab 的 raw 地址仍然会返回最后一次
// 成功的结果，HTTP 200、JSON 合法，看起来一切正常，但页面会长期停在旧数据上。
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_MAX_AGE_HOURS = 36;
const REQUIRED_ROW_FIELDS = ["index", "code", "name"];
const DEFAULT_FILE = path.join(__dirname, "..", "web", "public", "data", "latest.json");

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function verifyWebData(payload, options) {
  const settings = Object.assign({ maxAgeHours: DEFAULT_MAX_AGE_HOURS }, options);
  const now = settings.now ? new Date(settings.now) : new Date();
  const errors = [];
  const warnings = [];
  let ageHours = null;

  if (!isPlainObject(payload)) {
    return { errors: ["数据根节点必须是 JSON 对象"], warnings, ageHours };
  }

  if (payload.schemaVersion !== 1) {
    errors.push(`schemaVersion 必须为 1，实际为 ${JSON.stringify(payload.schemaVersion)}`);
  }

  if (!Array.isArray(payload.rows) || !payload.rows.length) {
    errors.push("rows 必须是非空数组");
  } else {
    payload.rows.forEach((row, position) => {
      if (!isPlainObject(row)) {
        errors.push(`rows[${position}] 不是对象`);
        return;
      }
      REQUIRED_ROW_FIELDS.forEach((field) => {
        if (typeof row[field] !== "string" || !row[field].trim()) errors.push(`rows[${position}] 缺少 ${field}`);
      });
    });
  }

  const completedAt = new Date(payload.completedAt);
  if (Number.isNaN(completedAt.getTime())) {
    errors.push(`completedAt 不是合法时间：${JSON.stringify(payload.completedAt)}`);
  } else {
    ageHours = (now.getTime() - completedAt.getTime()) / 3600000;
    if (ageHours > settings.maxAgeHours) {
      errors.push(`数据已过期：completedAt 为 ${payload.completedAt}，距今约 ${ageHours.toFixed(1)} 小时，超过 ${settings.maxAgeHours} 小时上限`);
    }
  }

  if (!isPlainObject(payload.health)) {
    errors.push("缺少 health 字段");
  } else if (payload.health.status !== "ok") {
    warnings.push(`数据完整度为 ${payload.health.status || "未知"}，页面会提示数据不完整`);
  }

  const feeRates = payload.feeRates;
  if (isPlainObject(feeRates) && Number(feeRates.errors) > 0) {
    warnings.push(`${feeRates.errors} 只基金的运作费率未取得，费率视图对应行为空`);
  }

  return { errors, warnings, ageHours };
}

function readAndVerify(filePath, options) {
  let text;
  try {
    text = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    return { errors: [`无法读取 ${filePath}：${error.message}`], warnings: [], ageHours: null };
  }
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    return { errors: [`${filePath} 不是合法 JSON：${error.message}`], warnings: [], ageHours: null };
  }
  const result = verifyWebData(payload, options);
  if (!result.errors.length) {
    const age = Number.isFinite(result.ageHours) ? `，生成于 ${result.ageHours.toFixed(1)} 小时前` : "";
    result.summary = `${payload.rows.length} 只基金，completedAt ${payload.completedAt}${age}`;
  }
  return result;
}

function parseMaxAgeHours(argv) {
  const match = argv.find((item) => item.startsWith("--max-age-hours="));
  if (!match) return DEFAULT_MAX_AGE_HOURS;
  const value = Number(match.split("=")[1]);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_MAX_AGE_HOURS;
}

function main(argv = process.argv.slice(2)) {
  const positional = argv.filter((item) => !item.startsWith("--"));
  const result = readAndVerify(path.resolve(positional[0] || DEFAULT_FILE), { maxAgeHours: parseMaxAgeHours(argv) });
  result.warnings.forEach((warning) => process.stdout.write(`注意：${warning}\n`));
  if (result.errors.length) {
    result.errors.forEach((error) => console.error(`FAIL: ${error}`));
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`PASS: 数据文件可用，${result.summary}\n`);
}

if (require.main === module) main();

module.exports = { verifyWebData, readAndVerify, main, DEFAULT_MAX_AGE_HOURS };
