
## 更新
git pull && node scripts/query-purchase-limits.js --output-dir .qdii-purchase-limits && npm run build:web-data -- --input .qdii-purchase-limits/latest.json --output web/public/data/latest.json