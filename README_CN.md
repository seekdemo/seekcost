# SeekCost

[English](README.md) | [简体中文](README_CN.md)

**你的研究，你的判断，你的数据。**

SeekCost 是采用 MIT 许可证、可自行部署的个人投资工作台。把股票池、研究、价格观察、提醒与决策记录放在一起，运行在自己的服务器上，不必把投资历史交给作者托管。

[Conda 本地启动](#conda--sqlite-快速启动) · [开始部署](docs/SELF_HOSTING.md) · [备份与恢复](docs/BACKUP.md) · [安全说明](SECURITY.md) · [MIT 许可证](LICENSE)

![SeekCost 股票池：分时走势、最新价和涨跌幅，全部为虚构演示数据](docs/images/watchlist-desktop.png)

> 截图来自实际界面，使用虚构的接口演示数据，不含真实持仓，也不是实时行情。项目持续开发中；请先在测试服务器完成容器部署和恢复演练，再存入唯一一份重要数据。

它围绕一条明确的投资闭环组织信息：

**理解公司 → 形成判断 → 看清持仓成本 → 回看结果**

持仓成本工作台聚焦正在持有的市场标的及其当前记录的成本。以前记录的定存、实物资产、个人财务和能力投入仍保存在数据库中，原页面也仍可访问，但不再占据成本工作流的主导航。SeekCost 不试图替代行情终端或券商软件，也不提供公开内容流、关注关系、热度推荐或自动发布能力。投资、判断与交易数据默认只属于当前用户。

## 几步搭建自己的工作台

准备 Docker Compose v2 与 Python 3，在项目根目录执行：

```bash
python3 scripts/selfhost-init.py
docker compose config --quiet
docker compose up -d --build
# 等待后端健康后，交互式输入自己的密码：
docker compose exec backend python -m app.core.owner myowner
```

访问 `http://localhost:3000`。远程服务器使用 SSH 隧道或 HTTPS 反向代理。正式部署不会自动创建 demo 账号，公开注册默认关闭，配置密钥在本地随机生成且不输出到终端。

**存入重要数据前：**把 `deploy/secrets/backup-password` 保存在服务器之外，并完成一次[恢复演练](docs/BACKUP.md)。自动备份已经加密，但未配置异地复制时仍然只是同机备份。不要用 `docker compose down -v` 升级，它会删除数据库数据卷。

HTTPS、初始化、升级与限制见[完整部署手册](docs/SELF_HOSTING.md)。现有 SQLite 数据需单独迁移，不会自动导入。仓库提供容器启动和恢复冒烟工作流，但尚未在本轮本地环境实际运行。

## Demo 体验账号

隔离的本地体验实例可以配置以下普通用户，并在 `http://localhost:3000/login` 登录。**仓库不包含该账户，全新部署也不会自动创建。**

| 项目 | 内容 |
| --- | --- |
| 用户名 | `demo` |
| 密码 | `demo123` |
| 权限 | 普通用户，无管理员权限 |

这是**主动公开的演示密码**，只用于隔离的体验环境。共享账号中的记录会被其他体验者看到、修改或删除，也可以被修改密码；不要导入真实持仓、券商报表或私人研究。本地体验实例的自选标的保存在其数据库里，数量和内容取决于部署者，并非仓库内置数据。富途原始 CSV 和数据库不随源码分发；导入的自选清单本身不包含基本面结论、估值或实时行情。

替换隔离 demo 的虚构自选示例：先备份，再在 `backend` 目录运行 `python -m app.core.demo_watchlist_import /path/to/全部.csv /path/to/美股.csv` 预览；核对后增加 `--apply` 执行。支持多个文件，重复标的合并，后面的文件优先提供名称，分类和主题合并。已有研究草稿或非示例内容会阻止替换。旧示例笔记归档保留，模拟资产和交易不受影响。

为隔离数据库中已有的普通 `demo` 用户填充示例：先备份数据库，再运行：

```sh
cd backend
python -m app.core.demo_data --confirm-demo
# Docker 方式（在仓库根目录运行）：
# docker compose exec backend python -m app.core.demo_data --confirm-demo
```

包含 8 个候选标的、5 项投资、6 笔交易、6 篇私有笔记、3 个交易计划、3 条暂停的提醒、2 条模拟通知和虚构日历事件。价格锚点、交易和研究均为示例，不构成投资建议；页面另外获取的行情和 K 线仍来自外部数据源。提醒默认暂停，避免误触发监控。脚本不创建账号、不修改密码、不授予管理员权限；成功后重复执行不会重复导入，遇到同名示例记录冲突会中止而不覆盖。服务启动时不会自动填充数据。

数据库不包含在源码中，因此克隆项目或首次 Docker 部署后，这个账号和本地自选清单都不会自动存在，需要部署者在隔离体验库中单独配置。普通注册和修改密码仍要求至少 8 位；这里的 7 位密码需由部署者为本地 demo 单独设置，不能直接通过注册页创建。不要覆盖已有同名账户，不要给 demo 授予管理员权限，也不要在保存真实数据的正式实例中使用这组凭据。

## 看看它怎么用

### 按自己的方式理解公司

在「研究资料库 → 公司研究室」选择公司：可以逐题引导，也可以自主展开全部问题。记录理解、证据、反面理由和改变想法的条件，保存进度后跨设备继续；确认后生成私有判断卡。第一版使用明确标注的模板提示，不代写结论、不自动获取财报或荐股。详见[公司研究室使用说明](docs/GUIDED_RESEARCH.md)。

### 关注公司，不只是收藏代码

通过哨兵池、研究池、击球区组织候选标的，把投资逻辑与价格锚点放在行情旁边。列表提供分时走势、最新价与涨跌幅排序，也明确展示延迟与不可用状态。它不是券商交易终端，不承诺实时行情。

### 等价格来到你的关注范围

为单只股票或全部股票池设置多条均线附近提醒，自定义周期、偏离比例、方向和冷却时间。全股票池规则自动纳入新增标的，触发后在站内通知中查看依据。

![自定义提醒：单标的与全股票池的均线观察规则，虚构演示数据](docs/images/alerts-desktop.png)

### 电脑深入研究，手机查看变化

同一套工作台适配桌面和手机。About 与使用指南说明产品理念和工作流程；管理员可维护 About 主要文案，而私人投资记录不会因此公开。

<img src="docs/images/watchlist-mobile.png" width="340" alt="SeekCost 手机端股票池，虚构演示数据" />

## 持仓成本工作台

主页面展示在持仓标的、记录的单位与合计成本、决策成本、参考价格及估算的未实现盈亏。汇总按当前汇率换算，不是历史汇率对账。IBKR CSV 导入可能覆盖已记录的券商成本，因此第一版**尚不能独立判定 IBKR 与 SeekCost 的成本差异**。打开单只持仓可查看交易和已导入的批次。当前仍只支持 CSV 导入，不直接连接 IBKR API。

旧的资产和个人财务记录仍保留，但不再作为 SeekCost 的核心导航任务。

在「个人设置 → 一级菜单」可按账户决定是否显示「持仓成本」等所有一级栏目，并调整顺序；桌面和手机同步。隐藏栏目只收起导航入口，不删除页面或数据。

## 主要功能

- 投资工作台：集中处理会改变仓位或判断的事项，不承载资讯流
- 持仓成本工作台：聚焦在持仓位、记录成本及交易和批次依据
- IBKR CSV 导入：导入部分活动报表数据；券商值与独立计算值的差异核对尚未实现
- 决策：组织候选标的、投资逻辑、证伪条件、交易计划和透明量化证据
- 复盘：从交易结果回到事前依据，沉淀执行偏差与策略改进
- 判断记录：结构化保存标签、专题、复核日期和个人批注，不承担内容分发
- 响应式界面：支持桌面、平板与手机
- 国际化界面：默认英文，支持简体中文、繁体中文、日语、西班牙语和法语
- 私有账号：仅支持用户名与密码注册登录，不依赖邮件服务
- 自定义提醒：均线附近规则、全股票池检测及站内通知
- 自托管工具：关闭公开注册、显式创建部署者账户、加密备份和只恢复到新库的保护机制
- 公共内容：About、使用指南及带权限校验、草稿发布、操作审计的内容后台

## 盘中预警预览行为

盘中预警预览属于临时提示，不会持久化为交易信号。每位用户最近一次预览会在后端进程内缓存五分钟；刷新在后台异步完成，因此接口可以立即返回最近一次可用预览。该缓存仅限单个进程：多 worker 部署若需要跨 worker 的缓存一致性，必须先接入共享缓存。

## 技术栈

- 前端：Next.js 16、React 19、TypeScript、Tailwind CSS
- 后端：FastAPI、SQLAlchemy、Alembic
- 数据库：PostgreSQL
- 测试：Pytest、Playwright、ESLint、TypeScript

## 本地启动

### Conda + SQLite 快速启动

准备 Conda 和带 npm 的 Node.js 20+，在仓库根目录执行：

```bash
conda env create -f environment.yml
conda activate seekcost-local
python scripts/local_dev.py
```

打开 `http://localhost:3000/register`，自行注册账户（密码至少 8 位）。启动器会初始化 `backend/data/seekcost-local.db`，首次运行时安装前端依赖，并同时启动前后端；按 Ctrl+C 一起停止。它**不会**使用或覆盖 `backend/data/seekcost.db`、`backend/.env` 或 Docker/PostgreSQL 数据库。SQLite 文件和本地签名密钥保存在被 Git 忽略的 `backend/data/` 中；加密的本地备份保存在同样被忽略的 `backend/backups/local-dev/`。如需恢复备份，请把备份密钥 `backend/data/backup.key` 另存到安全位置。新克隆的仓库从空库开始，不自带 demo 账号。

虚构示例数据是可选的：先在隔离体验库中注册普通 `demo` 账户，使用自己设置的至少 8 位密码。停止服务后，在仓库根目录运行 `python scripts/local_dev.py --seed-demo`；它只向这份独立 SQLite 数据库导入上方[Demo 体验账号](#demo-体验账号)所述的示例记录。正常启动不会自动导入；个人实例不要使用 `demo123`。

### 手动使用 PostgreSQL 开发

下面是不用 Conda/SQLite 启动器、分别运行前后端的 PostgreSQL 流程。

#### 1. 后端

需要 Python 3.10+ 和 PostgreSQL 14+。

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

在 `backend/.env` 中设置数据库连接和随机密钥，然后执行：

```bash
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

后端健康检查：`http://localhost:8001/health`

#### 2. 前端

需要 Node.js 20+。

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

访问 `http://localhost:3000`，首次使用时创建用户名和密码。界面默认使用英文，可在顶部导航中切换语言。

## 配置

后端配置均通过环境变量提供，真实值不得提交到 Git：

| 变量 | 用途 |
| --- | --- |
| `APP_ENV` | `development` 或 `production` |
| `SECRET_KEY` | JWT 签名密钥；生产环境至少 32 位 |
| `DATABASE_URL` | PostgreSQL 异步连接地址 |
| `CORS_ORIGINS` | 允许访问 API 的前端地址列表 |
| `SQL_ECHO` | 是否输出 SQL；默认关闭 |
| `ALLOW_REGISTRATION` | 本地开发默认 true，Compose 部署默认 false |

前端使用 `API_BASE_URL` 指定后端地址。不要把密钥写入 `NEXT_PUBLIC_*` 变量，因为这类变量会进入浏览器代码。

## 验证

```bash
cd backend
pip install -r requirements-dev.txt
pytest

cd ../frontend
npm run lint
npm run build
npm run test:e2e
```

Playwright 需要通过 `SEEKCOST_E2E_TOKEN` 提供测试账号令牌。

## 数据与隐私

- `.env`、数据库、导入导出、备份仓库、恢复密钥和上传文件均已加入忽略规则
- 不要提交真实券商报表、账户编号、持仓、交易记录或生产日志
- 发布公开仓库前，请完成 [开源检查清单](OPEN_SOURCE_CHECKLIST.md)
- 发现安全问题时，请遵循 [安全策略](SECURITY.md)
- 当前公开发布仓库从一个全新的初始提交开始，旧本地仓库的历史没有推到这里。每次发布仍需检查被跟踪文件、新提交、截图和密钥；Git 忽略规则不能代替安全审计。

### 使用边界

当前定位为私人自托管实例，不是开放注册的 SaaS。后台扫描与缓存依附后端进程，只支持单 worker 的这套部署方案。行情可用性受供应商和服务器网络影响；提醒为站内通知，不等于邮件或手机推送。容器完整验收、容量测试、依赖审计与真实恢复演练需要在部署环境完成。

截图可在前端运行时用 `cd frontend && npx playwright test e2e/readme-screenshots.spec.ts` 重新生成。测试拦截全部 API，不登录真实账号。

## 项目结构

```text
SeekCost/
├── backend/       FastAPI、模型、迁移与后端测试
├── frontend/      Next.js 应用与端到端测试
├── README.md      英文项目说明
├── README_CN.md   简体中文项目说明
└── DEPLOY.md
```

## 许可证

[MIT](LICENSE)，允许按许可证条款使用、修改、分发与商业使用。此许可证不授予第三方行情数据的使用或转售权。SeekCost 提供记录与决策辅助，不构成投资建议，也不是自动交易服务。
