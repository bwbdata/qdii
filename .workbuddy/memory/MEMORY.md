# qdii-purchase-limits 项目长期约定

## 项目形态

不是常驻服务，没有 `npm start`。三块：CLI 查询脚本（`scripts/query-purchase-limits.js`）、静态 H5（`web/public/`）、定时与云端发布（macOS launchd / GitHub Actions + Cloudflare Worker）。

## 硬约束（改动前必读）

1. **CLI 报告主表必须保持「单日申购上限 / 基金 / 代码」三列**，输出固定四区块。`SKILL.md` 有这些文字约定，`check-release.js` 会断言。新字段只进 `--json` 和 H5，不进 CLI 报告。
2. **不要动 `warnings` 的计数语义**。`query.test.js` 有 `assert.equal(payload.warnings.length, N)` 精确断言；新增可见性提示请走专用字段（如 `feeRates.errors`）。
3. **`.workbuddy/memory/` 已被 git 跟踪，且会被 `check-release.js` 全文扫描**（只跳过 `.git`/`node_modules`/`outputs`/`coverage` 与 `tests/`）。记忆与文档里禁止出现本机家目录绝对路径（斜杠 + Users 开头）和疑似凭据，一律用仓库相对路径。
4. **`node scripts/build-web-data.js` 不解析 `--help`**，会直接执行默认构建并覆盖被跟踪的 `web/public/data/latest.json`。查参数请读源码。
5. H5 用 `fetch` 读同目录 `data/latest.json`，**必须经 HTTP 服务访问**，直接双击 `index.html` 会白屏。页面加载异常的经典表现是「表头空白 + 按钮点不动 + 样式没生效」，十有八九是浏览器缓存了旧的 `app.js` / `styles.css`，先怀疑缓存再查代码。
6. **改了 `web/public/app.js` 或 `styles.css`，必须同步更新 `index.html` 里的 `?v=` 令牌**（值为该文件 sha256 前八位）。`tests/web-assets.test.js` 会断言两者一致，漏更新直接测试失败。
7. 前端表格的 grid 列宽在**桌面 / ≤520px 媒体查询 / 导出图片 sheet** 三处各有一份，改列必须三处同步；导出 sheet 的选择器要压过 `.table-card.view-fee`，需写到四级。

## 数据源

- 基金目录与销售状态、申购限额：天天基金公开页面；公告走公开公告索引与 PDF。
- 运作费率：`https://fundf10.eastmoney.com/jjfl_{code}.html` 的「运作费用」表。**反爬坑：连续快速请求返回 HTTP 514**，必须串行 + 间隔 350ms + 重试退避。
- 综合年化费率 = 管理费率 + 托管费率 + 销售服务费率（每年口径，已从净值扣除），与申购/赎回等一次性费用无关。

## 协作约定

- 每次改动后不跑 playwright 全链路，只做语法检查 + 最小冒烟，其余交给用户自测。
- 每轮改动按主题拆 commit 后立即提交（中文 Conventional Commits）。`.git/index.lock` 常被后台进程重建，需把 `rm -f .git/index.lock` 与 `git add`/`git commit` 放在同一条命令里。
