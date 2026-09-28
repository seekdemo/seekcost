# 自托管操作手册 / Self-hosting

SeekCost 是由你管理服务器和数据的个人投资工作台，不是托管式 SaaS。Compose 默认关闭公开注册，没有 demo 密码，也不会把第一个访问者自动设为管理员。

> **验收状态：**2026-09-28 已在一台 Ubuntu 24.04 服务器完成容器启动、HTTPS 登录页检查与 PostgreSQL 快照恢复演练。这不代表所有服务器、行情供应商和并发负载都已验证。公开发布与后续更新仍需执行 [开源检查清单](../OPEN_SOURCE_CHECKLIST.md)。

## 1. 准备与启动

- Linux 服务器上的 Docker Engine 与 Compose v2，初始化时需要 Python 3。Mac/Windows 可通过 Docker Desktop 试用。
- Git、可访问容器仓库和依赖源的网络；行情供应商还需独立验证网络可达性。
- 公网访问需要 HTTPS；可使用域名，或按下文用公网 IPv4 申请短期证书。也可以仅通过 VPN / SSH 隧道使用。
- 数据与备份使用持久磁盘，不要放在 `/tmp`。实际构建内存、行情任务负载与恢复耗时应在目标服务器测量，目前没有并发容量承诺。

在项目根目录执行：

```bash
python3 scripts/selfhost-init.py
docker compose config --quiet
docker compose up -d --build
docker compose ps -a
```

初始化创建 `.env` 和 `deploy/secrets/backup-password`，权限为 0600，拒绝覆盖已有文件。密码不会输出到终端。**立即把备份密码存入服务器以外的密码管理器**；丢失它就无法解密备份。

启动顺序：数据库健康 → Alembic 迁移成功 → 单 worker 后端健康 → 前端与备份服务。后台任务和缓存依附 API 进程，目前不要扩大 backend 副本数或添加多个 worker。

应用数据库角色 `seekcost` 不是超级用户；管理角色 `seekcost_admin` 仅用于数据库初始化及备份恢复。数据库、后端均不映射主机端口；前端只绑定 `127.0.0.1:3000`。

## 2. 创建自己的账户

后端健康后，在交互终端运行（把 `myowner` 换成自己的用户名）：

```bash
docker compose exec backend python -m app.core.owner myowner
```

按提示输入两次密码，不要把密码写进参数或 Issue。用户名为 3–32 位字母、数字、下划线或连字符；密码至少 8 个字符且不超过 72 个 UTF-8 字节。

命令创建账户并赋予公共内容编辑权限，不赋予读取其他账户投资数据的能力，不覆盖已有账户。可用它创建另一个受信任的编辑者。普通账户可以在受控网络短暂启用注册后创建，再关闭注册。

管理员入口在页脚，`/admin` 可编辑 About 主要文案。About 和使用指南是公共页面，**不要把持仓、账户信息或秘密写入 About**。

打开 `http://localhost:3000` 登录。远程机器初次配置时，可从自己的电脑建立隧道：

```bash
ssh -L 3000:127.0.0.1:3000 YOUR_SERVER
```

## 3. HTTPS 与配置

`deploy/Caddyfile` 是主机安装 Caddy 时的配置示例。设置 `SEEKCOST_DOMAIN` 为自己的域名，配置 DNS，允许证书签发所需的 80/443 端口。它反向代理本机 3000 端口；如果修改 `HTTP_PORT`，同步修改代理目标。

如果只用服务器公网 IPv4，使用 `deploy/nginx-ip-stream.conf.example` 和 `deploy/nginx-ip.conf.example` 两个 Nginx 模板。前者在公网 443 读取 TLS ALPN，把证书验证转发到本机 8443、正常请求转发到本机 8444；后者在本机 8444 终止 HTTPS 并反代前端 3000。**SeekCost 不监听 80 端口。**公网安全组只需为它开放 TCP 443；8443、8444 和 Docker 前端 3000 保持本机访问，数据库和后端不要开放公网端口。IP 地址的 Let's Encrypt 证书有效期仅 6 天，必须自动续期。

Ubuntu 24.04 上已验证的初装顺序如下；每条命令里的 `YOUR_PUBLIC_IP` 换成实际 IP。先安装 Nginx 的 stream 模块和 [acme.sh](https://github.com/acmesh-official/acme.sh)，停用 Nginx 默认站点，在 `/etc/nginx/nginx.conf` 顶层（`http {}` 外）加入 `include /etc/nginx/seekcost-stream.conf;`，把 stream 模板装到这个路径。此时不要安装 HTTPS 站点模板，因为还没有证书。启动 Nginx 后，它应只监听公网 443：

```bash
sudo apt-get install nginx libnginx-mod-stream
git clone --depth 1 https://github.com/acmesh-official/acme.sh.git /home/ubuntu/acme-sh-src
cd /home/ubuntu/acme-sh-src
sudo ./acme.sh --install --home /opt/seekcost-acme --no-cron --no-profile
cd -
sudo install -m 0644 deploy/nginx-ip-stream.conf.example /etc/nginx/seekcost-stream.conf
# 备份并编辑 /etc/nginx/nginx.conf，加入上述顶层 include；停用默认站点。
sudo nginx -t
sudo systemctl reload nginx
```

通过 443 的 TLS-ALPN 完成签发；`acme.sh` 会把验证监听器短暂绑定在本机 8443，80 端口始终不参与。需要先演练时，将下面的 `--server letsencrypt` 改为 `--server letsencrypt_test`；通过后再使用生产 CA 签发。不要在验证失败时频繁请求生产证书。正式证书签发后，安装到 Nginx 路径，并把替换过 IP 的 HTTPS 站点模板安装到 `/etc/nginx/sites-enabled/seekcost-ip`：

```bash
sudo env -u SUDO_USER -u SUDO_UID -u SUDO_GID /opt/seekcost-acme/acme.sh \
  --issue --alpn --tlsport 8443 --local-address 127.0.0.1 \
  --server letsencrypt --keylength ec-256 --certificate-profile shortlived \
  --days 3 -d YOUR_PUBLIC_IP --home /opt/seekcost-acme
sudo install -d -m 0700 /etc/ssl/seekcost-ip
sudo install -m 0600 /opt/seekcost-acme/YOUR_PUBLIC_IP_ecc/YOUR_PUBLIC_IP.key /etc/ssl/seekcost-ip/key.pem
sudo install -m 0644 /opt/seekcost-acme/YOUR_PUBLIC_IP_ecc/fullchain.cer /etc/ssl/seekcost-ip/fullchain.pem
sudo env -u SUDO_USER -u SUDO_UID -u SUDO_GID /opt/seekcost-acme/acme.sh \
  --install-cert -d YOUR_PUBLIC_IP --ecc \
  --key-file /etc/ssl/seekcost-ip/key.pem \
  --fullchain-file /etc/ssl/seekcost-ip/fullchain.pem \
  --reloadcmd 'systemctl reload nginx' --home /opt/seekcost-acme
# 将 deploy/nginx-ip.conf.example 内的 __PUBLIC_IP__ 替换后安装为站点配置。
sudo nginx -t
sudo systemctl reload nginx
sudo install -m 0644 deploy/seekcost-acme.service /etc/systemd/system/
sudo install -m 0644 deploy/seekcost-acme.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now seekcost-acme.timer
```

核对 `ss -ltn` 中没有 SeekCost 的 `:80` 监听、`systemctl list-timers seekcost-acme.timer` 显示下一次检查、`curl -I https://YOUR_PUBLIC_IP/login` 能验证证书。续期应在证书到期前成功；仅有 timer 存在不代表续期链路正常，应监测证书有效期和 `journalctl -u seekcost-acme.service`。这一配置会占用公网 443；要在同一 IP 的 443 托管更多 HTTPS 服务，需要统一管理反向代理和路由。

已有上述 IP 站点时，可以在同一个 443 上增加域名站点。先为域名添加指向服务器 IP 的 A 记录，确认 DNS 生效；以 `seekcost.seekdemo.com` 和 `152.32.188.30` 为例，保留 IP 站点为 `default_server`，域名站点由 TLS SNI 选择。Nginx stream 配置无需再监听第二个公网端口。域名证书通过同一个本机 8443 TLS-ALPN 验证通道签发，并由同一个 `seekcost-acme.timer` 检查续期：

```bash
sudo env -u SUDO_USER -u SUDO_UID -u SUDO_GID /opt/seekcost-acme/acme.sh \
  --issue --alpn --tlsport 8443 --local-address 127.0.0.1 \
  --server letsencrypt --keylength ec-256 \
  -d seekcost.seekdemo.com --home /opt/seekcost-acme
sudo install -d -m 0700 /etc/ssl/seekcost-domain
sudo env -u SUDO_USER -u SUDO_UID -u SUDO_GID /opt/seekcost-acme/acme.sh \
  --install-cert -d seekcost.seekdemo.com --ecc \
  --key-file /etc/ssl/seekcost-domain/key.pem \
  --fullchain-file /etc/ssl/seekcost-domain/fullchain.pem \
  --reloadcmd 'systemctl reload nginx' --home /opt/seekcost-acme
# 将 deploy/nginx-domain.conf.example 中的 __DOMAIN__ 替换为 seekcost.seekdemo.com，
# 安装为 /etc/nginx/sites-enabled/seekcost-domain；保留原 IP 站点。
sudo nginx -t
sudo systemctl reload nginx
```

其他域名也按此替换域名值。将 `.env` 中的 `CORS_ORIGINS` 同时包含 `https://seekcost.seekdemo.com` 和 `https://152.32.188.30`（如仍需 IP 登录），重新创建后端容器，再分别以两个 HTTPS 地址检查登录与证书。不要把证书私钥、`.env` 或备份密码加入 Git。

替换服务器或公网 IP 时，需要在新主机重新签发证书、替换 Nginx 模板中的 IP，更新 `.env` 的 `CORS_ORIGINS`，并恢复数据库与备份密钥；证书不能直接用于另一个 IP。没有有效 HTTPS 前，不要让用户通过纯 HTTP 输入密码。

容器化反向代理需要自行接入 Compose 网络并代理 `frontend:3000`，不能照抄主机的 `127.0.0.1`。

修改根目录 `.env` 后执行 `docker compose up -d`：

```dotenv
CORS_ORIGINS=["https://your-own-domain.example"]
ALLOW_REGISTRATION=false
```

IP 访问时将来源改为 `https://YOUR_PUBLIC_IP`；同时使用域名和 IP 时，把两者都加入 JSON 数组。保留 `http://localhost:3000` 只在仍需本地访问时。修改后重新创建后端容器以加载配置，并用浏览器检查登录请求是否正常。

Caddy 示例不是完整的公网防护方案；公网部署还需要登录限流、访问控制和外部监控。当前令牌保存在浏览器本地，改密不会立即撤销既有令牌，不建议直接开放公众注册。

| 配置 | 说明 |
| --- | --- |
| `SECRET_KEY` | 随机 JWT 密钥；轮换会使现有登录失效 |
| `APP_DB_PASSWORD` | 应用数据库角色密码 |
| `POSTGRES_PASSWORD` | 数据库管理密码，仅数据库/备份服务使用 |
| `HTTP_PORT` | 本机前端端口，默认 3000 |
| `ALLOW_REGISTRATION` | Compose 默认 false；本地开发默认 true |
| `BACKUP_DIR` | Restic 加密仓库，默认 `./backups`，必须持久化 |
| `BACKUP_INTERVAL_SECONDS` | 两次任务之间的等待时间，默认 86400 秒 |
| `OFFSITE_REPOSITORY` | 可选异地 Restic 仓库，需预先初始化 |
| `BACKUP_WEBHOOK_URL` | 可选 HTTPS JSON 状态通知地址 |

已有数据库的密码存储在数据库内，**只改 `.env` 不会更改角色密码**。需安排维护窗口在数据库更改角色密码并同步配置，不要删除数据卷来解决连接失败。

前端构建时固定代理 `http://backend:8001`；改服务名或单独部署时需要调整 Dockerfile 并重新构建，不能只改运行时变量。

## 4. 先验证备份与恢复

阅读 [备份恢复指南](BACKUP.md)，再运行：

```bash
docker compose logs --tail=50 backup
docker compose exec backup bash /scripts/health.sh
docker compose exec backup restic snapshots
```

默认每日同机加密备份，不等于异地容灾，也不是分钟级恢复点。健康检查非零表示失败或过期。Docker 的 unhealthy 标签不会自动通知或自动重启；需配置 webhook 或外部监控。整个服务器停机只有外部监控能够发现。

## 5. 升级与回退

第一版采用短暂停机流程，不承诺无停机升级。先阅读目标版本说明：

1. 记录当前 Git 版本与镜像信息，妥善保留 `.env`、数据卷与备份密码。
2. 停止写入：`docker compose stop frontend backend backup`。
3. 执行 `docker compose run --rm --no-deps backup bash /scripts/backup.sh once`。**失败就不要继续。**
4. 检查快照并在新数据库演练恢复，确认最近记录存在。
5. 切换到经过确认的目标版本，执行 `docker compose build`。
6. 显式迁移：`docker compose run --rm --no-deps migrate`，确认退出码为 0。
7. `docker compose up -d`，检查健康、登录和关键页面后恢复使用。

失败时保持应用停止，先排查，不跳过错误。升级后回退代码不等于回退数据库，不要盲目执行 `alembic downgrade`。需要回退时，以原版本配合升级前快照恢复到新库，再验证并切换。

**不要把 `docker compose down -v` 当作升级步骤，它会删除 PostgreSQL 数据卷。** 不要清理 `backups/` 或 `deploy/secrets/` 来重装。普通停止用 `docker compose stop`。

PostgreSQL 镜像固定 17 主版本；大版本升级需要独立导出/恢复，不能直接用新版本读取旧数据目录。镜像尚未按 digest 固定，部分 Python 依赖使用版本范围；正式发布应记录实际镜像并完成依赖审计。

## 6. 搬迁现有数据

- PostgreSQL：使用经过演练的备份恢复到目标新库，应用先与源版本一致，再另行升级。
- SQLite：本版本没有自动 SQLite → PostgreSQL 转换器。不能直接把 `.db` 复制进 PostgreSQL 卷。保留原库，单独映射、导入、数量核对和抽样检查，不覆盖源库。
- 数据可带走：完整逻辑备份涵盖账户、研究、交易和提醒；解密后是标准 PostgreSQL custom dump，不依赖作者的在线服务。

## 7. Docker 主机验收

- [ ] 空数据卷执行全部迁移成功，不是仅通过 create_all 建表。
- [ ] 应用角色不是超级用户，主机无 5432/8001 公网监听。
- [ ] 注册关闭、账户创建成功、权限隔离正确。
- [ ] 实测目标机器的行情、K 线与提醒；明确过期/休市状态。
- [ ] 备份成功，故障状态与通知可见。
- [ ] 真正恢复到新库并核对记录，原库未改变。
- [ ] 重启仍有数据，完成测试升级与恢复。
- [ ] 密钥异地保管，另一台机器可以读取异地仓库。

`.github/workflows/selfhost-smoke.yml` 提供隔离 runner 上的容器启动和恢复冒烟检查，不能代替目标服务器的网络与容灾演练。

## English quick reference

Install Docker Compose v2 and Python 3. Run `python3 scripts/selfhost-init.py`, `docker compose config --quiet`, then `docker compose up -d --build`. Once the backend is healthy, run `docker compose exec backend python -m app.core.owner YOUR_USERNAME` interactively. Signup is closed by default; no demo credentials are installed.

Only the frontend binds to host loopback port 3000. Use an SSH tunnel, VPN, or HTTPS reverse proxy; a host Caddy example is included. Never expose PostgreSQL. Keep one API worker because schedulers/caches are process-local. Public hosting still requires rate limiting and security review.

Keep the generated environment file and persistent database volume. Store the backup password separately, off-server. Daily backups are encrypted but local unless offsite replication is configured. Read [the recovery guide](BACKUP.md#english-recovery-reference) and perform a real recovery drill before trusting the installation with your only copy of important data.

For upgrades: stop frontend/backend/backup, back up successfully, verify recovery, build the reviewed version, run migration explicitly, then restart and check. Never use `down -v` to upgrade. Changing environment passwords does not update existing database roles. SQLite migration and PostgreSQL major upgrades require separate work. This development environment had no Docker runtime; full container acceptance remains a release gate.
