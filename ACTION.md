## 1
已完成：同一仓库内加入 H5 页面、公开数据导出和 Cloudflare Pages 发布工作流，不需要拆仓库。

  新增内容：

  - web/public/index.html：指数切换、基金搜索、限额卡片、直销限额折叠表、数据完整度提示，移动端可用。
  - scripts/build-web-data.js：将查询结果转换为前端专用 JSON，剔除来源链接、公告链接等内部字段。
  - .github/workflows/publish-h5.yml：北京时间每日 09:10、14:30、20:30 查询并部署到 Cloudflare Pages；查询不完整时不
    会发布。

  - README.md:197：列出 Cloudflare Token、账户 ID、Pages 项目名的配置方法。

  已运行 npm test，51 项离线检查全部通过。

  下一步只需在 GitHub Actions 配置 CLOUDFLARE_API_TOKEN、CLOUDFLARE_ACCOUNT_ID 和 CF_PAGES_PROJECT，然后手动触发一
  次“更新并发布 H5”。


## 2
已经上传这个仓库到github上了,怎么让github生成最新的latest.josn


  https://你的域名/data/latest.json

  1. 打开 GitHub 仓库 → Settings → Secrets and variables → Actions。
  2. 在 Secrets 新增：
      - CLOUDFLARE_API_TOKEN
      - CLOUDFLARE_ACCOUNT_ID

  3. 在 Variables 新增：
      - CF_PAGES_PROJECT：你在 Cloudflare 创建的 Pages 项目名称。

  4. 回到仓库的 Actions 页面，选择“更新并发布 H5”工作流，点击 Run workflow。

  它会依次：

  查询基金数据 → 生成 .qdii-purchase-limits/latest.json
             → 转为 web/public/data/latest.json
             → 发布到 Cloudflare Pages

  之后会按每天北京时间 09:10、14:30、20:30 自动更新。

  如果你希望 latest.json 也直接出现在 GitHub 仓库文件列表里，需要把工作流改成“生成后自动提交 JSON”；但我不建议这样
  做，会导致每天产生多次无意义提交。对于 H5，直接从 Pages 的 /data/latest.json 读取是更合适的方式。



 ## 3
 按下面操作即可。

  1. 获取 CLOUDFLARE_ACCOUNT_ID

  登录 Cloudflare 后，进入任意一个账户的首页/概览页，右侧或页面底部通常有 Account ID，点击复制即可。注意是 Account
  ID，不是某个域名的 Zone ID。Cloudflare 官方也说明可在账户页面复制该 ID。 官方说明
  (https://developers.cloudflare.com/videos/create-api-tokens/)

  2. 创建 CLOUDFLARE_API_TOKEN

  进入 Cloudflare：

  头像 → My Profile → API Tokens → Create Token

  然后：

  - 选择 Create Custom Token
  - Token 名称可填：github-qdii-pages-deploy
  - Permissions 添加一项：

  Account → Cloudflare Pages → Edit

  - Account Resources 选择你的账户；如果可选，限定为对应账户即可
  - 点击 Continue to summary → Create Token
  - 立即复制 Token

  Cloudflare Pages 的部署 API 需要 Cloudflare Pages: Edit 权限；Token 只显示一次，丢失后只能重新创建。 Cloudflare
  Pages 官方文档 (https://developers.cloudflare.com/pages/configuration/api/)

  3. 保存到 GitHub

  仓库 → Settings → Secrets and variables → Actions：

  - Secrets → New repository secret
      - Name: CLOUDFLARE_API_TOKEN
      - Value: 刚复制的 Token

  - 再新增：
      - Name: CLOUDFLARE_ACCOUNT_ID
      - Value: Account ID

  然后在 Variables 添加：

  CF_PAGES_PROJECT = 你的 Cloudflare Pages 项目名称

  最后去 GitHub 的 Actions → 更新并发布 H5 → Run workflow。运行成功后，页面会生成并发布，latest.json 位于：

  https://你的-pages-域名/data/latest.json 