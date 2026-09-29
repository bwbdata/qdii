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

## H5 前端约定

- 两个视图：额度（末列代销/直销，按额度降序，主标题「QDII 申购限额」）、费率（末列综合费率，**按费率降序，贵的在前**，主标题「QDII 费率总览」）。未取到费率的行排最后。主标题文案集中在 `pageTitles` / `titleFor()`，页面 `<h1 id="page-title">` 与导出 sheet 的 `<h1>` 共用；浏览器标签页 `<title>` 不随视图变。
- **同一只基金的不同份额共用一个排序基准，取 A 类的费率**；组内固定 A、C、E、I… 顺序，未公示费率的排最后。分组键由名称归一化得到（去「人民币」/「(人民币)」，只认结尾紧跟非拉丁字符的单个大写字母为份额类别，避免 QDII-FOF 被误判）。
- 降序排序时未公示值用 `-Infinity` 当键（用 `Infinity` 会翻到最前面）。
- 组内排序必须用归一化分组键，**不要直接比原始名称**——「人民币」有时插在类别字母前面，会拆散同组份额。
- 排序前把所有额度/费率归一成数字或 `null`，别让 `undefined` 进比较器（会算出 `NaN` 打乱排序）。
- **工具按钮一律放在 `.status-bar` 行内**（左「数据完整」状态框、右按钮组，顺序是切换按钮 → 导出按钮，靠 `.view-toggle { margin-left: auto }` 顶到右侧），不要在 `.toolbar` 里另起一行；`.toolbar` 只放指数筛选 tabs。
- `.data-status` 有 `display:flex`，会盖掉 `hidden` 的默认 `display:none`，所以需要 `.data-status[hidden]{display:none}` 兜底，否则加载前会出现空绿框。
- 导出图片走 js 新建的 `.export-sheet`（标题 / 状态文字 / 表格 / 页脚，无按钮），改页面按钮布局不会影响导出结果。

## 协作约定

- 每次改动后不跑 playwright 全链路，只做语法检查 + 最小冒烟，其余交给用户自测。
- 每轮改动按主题拆 commit 后立即提交（中文 Conventional Commits）。`.git/index.lock` 常被后台进程重建，需把 `rm -f .git/index.lock` 与 `git add`/`git commit` 放在同一条命令里。
