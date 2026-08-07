# QDII 指数基金申购限额查询

一个用于查询纳斯达克100、标普500相关 QDII 基金申购状态的 Agent Skill。

它可以查询当前申购限额、整理基金公司直销公告限额、记录额度变化，并可选启用每日自动查询和变化通知。项目只提供公开信息查询，不提供基金推荐、收益排名、交易信号或投资建议。

## 支持的 Agent

| Agent / 工具 | 安装位置或方式 | 使用方式 |
| --- | --- | --- |
| [Codex](https://developers.openai.com/codex/skills) | `~/.agents/skills/` | 使用 `$qdii-purchase-limits` 或直接描述查询需求 |
| [Claude Code](https://code.claude.com/docs/en/skills) | `~/.claude/skills/` | 使用 `/qdii-purchase-limits` 或直接描述查询需求 |
| [GitHub Copilot](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills) | `~/.copilot/skills/` | 直接要求使用 `qdii-purchase-limits` |
| [Gemini CLI](https://geminicli.com/docs/cli/skills/) | `gemini skills install <仓库地址>` | 直接描述查询需求，由 Agent 激活 Skill |
| [Qwen Code](https://qwenlm.github.io/qwen-code-docs/en/users/features/skills/) | `~/.qwen/skills/` | 直接要求使用 `qdii-purchase-limits` |
| [Kimi Code CLI](https://www.kimi.com/code/docs/kimi-code-cli/customization/skills.html) | `~/.kimi-code/skills/` | 直接要求使用 `qdii-purchase-limits` |
| [CodeBuddy Code](https://www.codebuddy.cn/docs/cli/skills) | `~/.codebuddy/skills/` | 直接要求使用 `qdii-purchase-limits` |
| [Qoder IDE / CLI](https://docs.qoder.com/zh/extensions/skills) | `~/.qoder/skills/` | 直接要求使用 `qdii-purchase-limits` |
| [华为云码道 CodeArts Doer](https://support.huaweicloud.com/usermanual-cli/codeartsagent_cli_0019.html) | `~/.codeartsdoer/skills/` | 直接要求使用 `qdii-purchase-limits` |
| [腾讯 WorkBuddy](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market) | 在技能页面导入完整 Skill 包 | 在 Skill 列表中启用后直接描述查询需求 |
| [TRAE / TRAE CN](https://docs.trae.ai/ide/skills) | `.agents/skills/`，随后在 Skills 中启用 | 直接要求使用 `qdii-purchase-limits` |

完整功能需要 Agent 能够读取本地 Skill、执行 Node.js 命令并访问公开网络。TRAE 不同版本的 Skill 目录可能不同，请以当前客户端提示为准。

## 功能

- 查询纳斯达克100和标普500相关人民币场外基金。
- 按单日申购上限从高到低输出基金和份额代码。
- 单独列出基金公司直销公告限额。
- 比较上次查询，提示额度或状态变化。
- 支持 macOS 每日三次自动查询和开机补跑。
- 支持飞书群机器人和通用 JSON webhook。

## 复制给 AI 安装

将下面这段话发送给支持 Agent Skills 和本地命令执行的 AI：

```text
请从 https://github.com/aiten2/qdii-purchase-limits 安装这个 Skill。
```

### 手动安装

对于支持目录安装的 Agent，在上表对应的 Skill 目录执行；Gemini CLI 和 WorkBuddy 请使用表中的专用安装入口：

```bash
git clone https://github.com/aiten2/qdii-purchase-limits.git \
  <你的 Agent Skill 目录>/qdii-purchase-limits
```

安装依赖并验证：

```bash
cd <Skill 安装目录>/qdii-purchase-limits
npm ci --omit=optional --ignore-scripts
npm test
```

## 查询

在 Skill 目录运行：

```bash
node scripts/query-purchase-limits.js
```

常用参数：

```bash
# 只查纳斯达克100
node scripts/query-purchase-limits.js --index nasdaq100

# 只查标普500
node scripts/query-purchase-limits.js --index sp500

# 查看暂停、不可申购和未知项目
node scripts/query-purchase-limits.js --details

# 输出 JSON
node scripts/query-purchase-limits.js --json

# 跳过份额时间线缓存并刷新公告索引；已解析的同 ID 公告 PDF 仍会安全复用
node scripts/query-purchase-limits.js --force
```

也可以直接对 Agent 说：

> 使用 `qdii-purchase-limits` 查询今天的纳斯达克100和标普500基金申购限额。只运行 Skill 自带的默认查询脚本，不要添加 `--details`。最终回复只能包含脚本的完整标准输出，前后不要添加任何解释或总结。

## 输出

默认报告包含：

- 查询时间和数据完整度。
- 纳斯达克100代销渠道申购限额表。
- 纳斯达克100基金公司直销公告限额表。
- 标普500代销渠道申购限额表。
- 标普500基金公司直销公告限额表。
- 相比上次查询发生的额度或状态变化。

主表固定为三列：

| 单日申购上限 | 基金 | 代码 |
| :---: | --- | :---: |
| 100元 | 示例基金 | 000001、000002 |

同一基金、同一限额的多个份额会合并显示。未列入主表的相关基金默认用一句话概括；使用 `--details` 可以查看逐只状态。

直销表来自基金公告中的适用限额，并以“基金公司官方 APP 实际显示为准”作为提示。公告限额不等同于当天一定能够提交申购。

## 查询范围

默认范围：

- 人民币份额。
- 场外申购。
- 名称匹配纳斯达克100、纳指100或标普500的基金。

可使用 `--include-usd` 加入美元份额，使用 `--include-etf` 加入场内 ETF。场内 ETF 会标明交易所路径。

## 数据来源

- 基金目录和默认销售状态：天天基金公开页面。
- 基金公告：公开基金公告索引及公告 PDF。
- 基金管理人官网：在其他公开来源缺少适用直销规则时补充查询。

默认销售页和基金公司直销属于不同申购路径，销售限制可能不同。详细来源、第三方名称和使用边界见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

## 变化记录

查询结果默认保存在：

```text
~/.qdii-purchase-limits/
```

| 文件 | 内容 |
| --- | --- |
| `latest.md` | 最新报告 |
| `latest.json` | 最新结构化结果 |
| `state.json` | 变化比较基线 |
| `official-pdf-event-cache.json` | 按公告 ID 和解析器版本保存的本地解析缓存 |
| `history/` | 最近 90 次查询快照 |

第一次查询建立基线。从第二次开始，系统会提示额度提高、额度降低、状态变化以及记录新增或消失。数据不完整时不会覆盖上次有效基线。

## 每日自动查询

默认时点为北京时间：

| 时段 | 时间 |
| --- | --- |
| 盘前 | 09:10 |
| 盘中 | 14:30 |
| 盘后 | 20:30 |

macOS 管理命令：

```bash
node scripts/manage-macos-automation.js print
node scripts/manage-macos-automation.js install
node scripts/manage-macos-automation.js status
node scripts/manage-macos-automation.js uninstall
```

自动化默认关闭。安装后使用独立的 `io.github.qdii-purchase-limits.scheduler`，并在开机时补跑当天最近一个错过的时段。

Windows 和 Linux 可以通过系统计划任务运行：

```bash
node scripts/run-scheduled.js
```

## 变化通知

支持飞书群机器人和通用 JSON webhook。默认只在数据完整且发生变化时发送。

手动运行：

```bash
QDII_LIMIT_WEBHOOK_TYPE=feishu \
QDII_LIMIT_WEBHOOK_URL="https://..." \
node scripts/run-scheduled.js --force
```

macOS 后台任务可以从 Keychain 读取 webhook：

```bash
security add-generic-password -U \
  -a "$USER" \
  -s qdii-purchase-limits-webhook \
  -w
```

webhook 地址不应写入仓库、Skill 文件或 LaunchAgent plist。

## H5 页面与 Cloudflare Workers

无需拆分仓库。`web/public/` 是静态 H5；GitHub Actions 运行现有查询脚本，生成脱敏的 `data/latest.json`，自动提交该 JSON 到仓库，并将页面和数据一起发布到 Cloudflare Worker 静态资源。浏览器不会直接抓取基金网站或公告。

首次在 Cloudflare Workers 创建静态资源 Worker（不必连接 Git），然后在 GitHub 仓库 Settings → Secrets and variables → Actions 设置：

- Secret `CLOUDFLARE_API_TOKEN`：在 `My Profile → API Tokens` 创建的用户 Token。权限需要 `Account Settings → Read`、`Workers Scripts → Edit`、`Workers KV Storage → Edit`、`Workers R2 Storage → Edit`、`User Details → Read`、`Memberships → Read`；如该 Worker 使用自定义域名路由，再为对应 Zone 添加 `Workers Routes → Edit`。
- Secret `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账户 ID。
- Variable `CF_WORKER_NAME`：Worker 名称，例如 `qdii`。也可将同名值保存为 Secret。

之后在 Actions 手动运行一次“更新并发布 H5”。工作流每天北京时间 09:10、14:30、20:30 更新，最长运行 30 分钟。若查询不完整，H5 仍会发布已核验的部分结果，并在页面明确提示数据不完整；暂未确认项目不会进入限额清单。数据无变化时不会创建空提交。

如果已经手动更新并提交了 `web/public/data/latest.json`，可在 Actions 中运行“手动发布 H5”。该工作流只校验 JSON 并发布现有 `web/public/` 到 Worker，不会重新查询或改写数据。

本地生成页面数据：

```bash
node scripts/query-purchase-limits.js --output-dir .qdii-purchase-limits
npm run build:web-data -- --input .qdii-purchase-limits/latest.json
```

请用任意静态 HTTP 服务预览 `web/public/`，不要直接双击 `index.html`。

## 环境与隐私

- Node.js 22 或更高版本。
- 可访问公开基金网页的网络环境。
- 可写的本地数据目录。
- 实时查询不需要 API key、登录账号或第三方数据库 token。
- 通知功能只有在主动启用时才需要用户自己的 webhook。

## 合规说明

- 项目只查询公开页面中的必要状态信息，不附带第三方历史数据库或公告全文。
- Nasdaq、S&P、天天基金及各基金公司的名称和商标归其权利人所有。
- 项目与上述机构不存在隶属、合作或背书关系。
- 查询结果仅用于信息整理，不构成投资建议。
- 最终申购状态和额度以实际销售渠道及基金公司公告为准。

## 许可证

代码使用 [MIT License](LICENSE)。

参与贡献请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题请按 [SECURITY.md](SECURITY.md) 私下报告。
