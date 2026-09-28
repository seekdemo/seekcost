# SeekCost 自托管部署 / Self-hosting

> 新的 Docker 部署与数据保护流程见 **[自托管操作手册](docs/SELF_HOSTING.md)** 和 **[备份恢复指南](docs/BACKUP.md)**。推荐从这两份文档开始；下面保留的是手动部署参考，不会自动配置备份或关闭公开注册。

## 生产要求

- Node.js 20+
- Python 3.10+
- PostgreSQL 14+
- HTTPS 反向代理

## 后端

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8001
```

生产环境至少需要配置：

```dotenv
APP_ENV=production
SECRET_KEY=<至少 32 位随机字符串>
DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>:5432/<database>
CORS_ORIGINS=["https://seekcost.example.com"]
SQL_ECHO=false
```

应用会拒绝使用默认或过短的生产签名密钥。

## 前端

```bash
cd frontend
npm ci
API_BASE_URL=http://127.0.0.1:8001 npm run build
API_BASE_URL=http://127.0.0.1:8001 npm start
```

默认监听 3000 端口。建议由 Nginx、Caddy 或云平台统一终止 HTTPS，再将请求转发到前端；前端会把 `/api/*` 代理到 `API_BASE_URL`。

## 发布检查

1. 先备份数据库，再执行 `alembic upgrade head`。
2. 确认 `.env`、数据库文件、导入导出文件和日志未进入镜像或 Git。
3. 确认 `SQL_ECHO=false`，避免财务数据出现在日志中。
4. 运行后端测试、前端 Lint、生产构建和 Playwright。
5. 检查 `/health`、注册、登录、股票池、研究库和交易闭环。

更完整的公开发布检查见 [OPEN_SOURCE_CHECKLIST.md](OPEN_SOURCE_CHECKLIST.md)。
