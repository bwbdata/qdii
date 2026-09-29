const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const publicDir = path.join(__dirname, "..", "web", "public");
const indexHtml = fs.readFileSync(path.join(publicDir, "index.html"), "utf8");

const contentHash = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(publicDir, file))).digest("hex").slice(0, 8);

const referencedVersion = (file) => {
  const match = indexHtml.match(new RegExp(`${file.replace(".", "\\.")}\\?v=([0-9a-f]+)`));
  return match ? match[1] : null;
};

// H5 由静态服务与 Cloudflare 直接托管，没有构建期改写资源名的步骤。
// 只改了 app.js / styles.css 而忘记同步 index.html 的 ?v= 时，浏览器会继续用缓存里的旧文件，
// 表现为表头空白、按钮点不动、样式没生效，很难一眼看出是缓存。这里把它变成离线可发现的错误。
test("index.html 的静态资源版本号与文件内容哈希一致", () => {
  ["styles.css", "app.js"].forEach((file) => {
    const expected = contentHash(file);
    assert.equal(
      referencedVersion(file),
      expected,
      `web/public/index.html 里 ${file}?v= 需要更新为 ${expected}`
    );
  });
});

test("index.html 引用静态资源时都带版本号", () => {
  assert.match(indexHtml, /href="\.\/styles\.css\?v=[0-9a-f]{8}"/);
  assert.match(indexHtml, /src="\.\/app\.js\?v=[0-9a-f]{8}"/);
});

test("切换视图的按钮放在数据状态行内", () => {
  const start = indexHtml.indexOf('<section class="status-bar">');
  assert.ok(start >= 0, "index.html 缺少 status-bar 区块");
  // 状态行里嵌着 #data-status 这个 section，所以按按钮的结束标签取整块，不能按第一个 </section> 截断。
  const statusBar = indexHtml.slice(start, indexHtml.indexOf("</button>", start));
  assert.match(statusBar, /id="data-status"/);
  assert.match(statusBar, /id="view-toggle"/);
  assert.match(statusBar, /data-view="amount"/);
  assert.match(statusBar, /data-view="fee"/);
});

test("表格骨架由脚本渲染，页面只提供空容器", () => {
  assert.match(indexHtml, /<div id="table-head" class="table-head"><\/div>/);
  assert.match(indexHtml, /<div id="fund-list" class="fund-list"><\/div>/);
  assert.doesNotMatch(indexHtml, /col-fee|col-amount|col-fund|col-code/);
});
