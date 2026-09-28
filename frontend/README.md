# SeekCost Frontend

SeekCost 的 Next.js 前端。完整的产品说明、环境配置和启动步骤请查看仓库根目录的 [README](../README.md)。

```bash
npm ci
cp .env.example .env.local
npm run dev
```

默认访问 `http://localhost:3000`，并通过 `API_BASE_URL` 将 `/api/*` 代理到后端。
