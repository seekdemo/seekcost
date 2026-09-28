# SeekCost Frontend

SeekCost 的 Next.js 前端。完整的产品说明、环境配置和启动步骤请查看仓库根目录的 [README](../README.md)。

本地初次体验建议在仓库根目录用 Conda 运行 `python scripts/local_dev.py`；它会在缺少前端依赖时执行 `npm ci`，并同时启动前后端。下面是单独启动前端的方式：

```bash
npm ci
cp .env.example .env.local
npm run dev
```

默认访问 `http://localhost:3000`，并通过 `API_BASE_URL` 将 `/api/*` 代理到后端。
