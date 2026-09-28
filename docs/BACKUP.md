# 数据备份、恢复与迁移

**备份成功 ≠ 可以恢复。** 只有在独立数据库完成恢复并检查数据后，才能确认恢复路径可用。

## 本地 SQLite 开发实例（与下方 Docker / PostgreSQL 独立）

本地 SQLite 可以通过 `SQLITE_BACKUP_DIR` 显式启用加密快照，`SQLITE_BACKUP_INTERVAL_SECONDS` 默认 3600。启动时先完成一次备份，后端运行时再每小时备份；停止服务或电脑关机时不会执行。该开关默认关闭，不影响 PostgreSQL 的 Restic 流程。

数据库请放在持久目录，例如 `backend/data/seekcost.db`，不要放 `/tmp`。首次备份在数据库旁创建 `backup.key`，密钥与快照权限均为 0600，备份目录为 0700。使用 SQLite 在线备份 API 取得一致快照，再在内存中生成 SQL 并通过 Fernet 认证加密，不把明文导出落盘。此路径适合小型个人开发数据库；内存使用随数据量增长，大型实例使用下方 PostgreSQL 方案。

**必须把 `backup.key` 另存到密码管理器或离线安全位置。** 只有密文、没有原密钥无法恢复。同机加密备份不等于异地容灾；本地流程暂不发送 webhook，可通过后端 `/health/backup` 和日志检查状态，没有自动清理历史快照，需关注磁盘容量。开发数据库本身没有应用层加密，需保护主机账号和磁盘。

在 `backend` 目录手动备份或恢复（将 SNAPSHOT 替换为实际文件名）：

```bash
.venv/bin/python -m app.core.sqlite_backup backup data/seekcost.db backups --key data/backup.key
.venv/bin/python -m app.core.sqlite_backup restore backups/SNAPSHOT.sql.fernet data/recovered-new.db --key data/backup.key
```

恢复目标必须不存在，工具不会覆盖当前数据库。只恢复自己信任的快照。核查恢复内容后再安排停机、修改连接配置；原库保留。数据库目录、密钥与本地备份均已加入 Git 忽略规则。

以下章节描述 Docker / PostgreSQL 的另一套备份流程，两类备份格式不能混用。

## 覆盖范围与恢复点

通过 `pg_dump --format=custom` 获取一致性逻辑快照，通过管道交给 Restic 加密；不在主机生成明文数据库文件。包括密码哈希、研究、持仓交易、提醒、通知、About 和权限记录。

不包括代码、`.env`、备份密钥、系统配置、外部服务或数据库之外的自定义附件。另行保存应用版本、配置和密钥，不要与仓库放在一起。

- 默认间隔 86400 秒，加上任务耗时。最坏可能丢失约一天或更久的数据，取决于最后成功的快照。
- 可缩短 `BACKUP_INTERVAL_SECONDS`（最低 60），但需评估负载。这不是 WAL/PITR，不承诺分钟级恢复点。
- 同机备份不能抵御整台服务器、磁盘或账号损坏。
- `deploy/secrets/backup-password` 必须异地保管。丢失后无法恢复；重新生成密码不能解开旧备份。
- **不自动删除历史快照**。监控磁盘空间，确认异地副本和恢复演练后，由部署者单独制定保留/清理策略；不要手工删除仓库内部文件。

## 手动备份和检查

在项目根目录执行：

```bash
docker compose exec backup bash /scripts/backup.sh once
docker compose exec backup bash /scripts/health.sh
docker compose exec backup restic snapshots
docker compose exec backup cat /backups/.seekcost-success
```

定时任务正在运行时，手动命令返回 75，等待完成再试。成功标记第一行是 Unix 时间，第二行是成功流水线的快照 ID。启用异地复制后，复制也成功才推进标记。

导出失败可能留下不完整快照，**不能用 latest 猜测可恢复快照**。恢复工具要求明确 ID，以成功标记和日志为依据。标记不是防篡改证明，仍需恢复演练。

```bash
docker compose exec backup restic check --read-data
```

这会读取全部备份数据，可能产生流量和费用。仓库完整性检查不能替代 PostgreSQL 恢复与业务核对。

## 失败通知

可设置 `BACKUP_WEBHOOK_URL` 为你控制的 HTTPS 接口，发送内容不含投资数据：

```json
{"service":"seekcost-backup","status":"failed"}
```

成功时 `status` 为 `ok`。这是通用 JSON，不保证所有聊天软件可直接接收。URL 可能包含认证信息，按密钥保护。通知发送失败也会标记异常。

健康检查在备份失败或成功时间超过“间隔 + 1 小时”后失败。Docker 不会主动发消息；没有 webhook 时至少要外部检测容器健康和备份时间。整个服务器停机需要外部“预期成功消息未到达”监控。

## 异地备份（可选）

以自己的 S3 兼容存储为例，在 `.env` 配置：

```dotenv
OFFSITE_REPOSITORY=s3:https://YOUR_S3_ENDPOINT/YOUR_BUCKET/seekcost
AWS_ACCESS_KEY_ID=YOUR_OWN_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_OWN_SECRET_KEY
AWS_DEFAULT_REGION=YOUR_REGION
```

服务商、存储桶、权限、费用由部署者管理。本版本远端与本地使用同一份 Restic 密码文件，应用容器拿不到该密钥或存储凭据。

首次初始化远端（不会创建云存储桶；已有仓库不重复 init）：

```bash
docker compose run --rm --no-deps backup sh -c 'restic -r "$OFFSITE_REPOSITORY" init'
docker compose up -d backup
docker compose exec backup bash /scripts/backup.sh once
docker compose exec backup sh -c 'restic -r "$OFFSITE_REPOSITORY" snapshots'
```

每次本地成功后增量复制，远端失败不会报告整体成功。使用独立备份账号、存储版本控制或适配 Restic 的追加写网关降低主机失陷后的风险。**普通 S3 写入凭据不天然防删除**；也不要未经验证拒绝全部删除，Restic 需要管理锁文件。

本地仓库丢失时，在新机器恢复密码和配置，将 Restic 目标改为远端，列出并检查快照后按下节恢复。也可用 Restic copy 复制到新的本地仓库，不覆盖仍有价值的旧仓库。

## 恢复演练：不覆盖生产数据库

从成功标记取得快照 ID，替换命令中的 `SNAPSHOT_ID`。选择未使用的新数据库名，以 `seekcost_restore_` 开头，只含小写字母、数字和下划线：

```bash
docker compose exec backup bash /scripts/restore.sh SNAPSHOT_ID seekcost_restore_drill1
```

先创建新库，再 `pg_restore --exit-on-error`。目标已存在就拒绝；没有 DROP、--clean 或覆盖策略。失败的恢复库保留以便排查，原库不变。

至少检查：

- Alembic 版本，账户、股票池、研究、交易和提醒数量。
- 最近重要研究与交易的具体内容。
- 匹配版本应用在隔离环境连接恢复库，检查登录和权限。不要让演练实例同时运行真实提醒扫描。

记录演练日期、快照 ID、应用版本和结果，不上传私人验证截图。定期及升级前重复演练；恢复耗时要实测，没有 RTO 保证。

## 正式恢复切换

确认恢复成功后停机，保留原库。在自己的 Compose 配置中同时修改 **API/迁移服务的 DATABASE_URL** 和 **备份服务的 PGDATABASE**，指向验证后的恢复库。当前生产库名写在 compose.yaml，不能只改一个不起作用的 .env 字段。

重新创建服务后核对数据和下一次备份。回退时考虑切换后新增数据，不在多个库间反复切换造成分叉。旧库清理由部署者另行确认，脚本不自动删除。

## 把数据带走

Restic 解密后是标准 PostgreSQL custom dump，可由原生 pg_restore 迁移，不依赖作者服务。只恢复可信来源的备份，逻辑备份可能包含可执行 SQL 对象。

```bash
# Sensitive plaintext export on YOUR computer: protect it and keep it out of Git.
umask 077
docker compose exec -T backup restic dump SNAPSHOT_ID seekcost.dump > seekcost-export.dump
```

## English recovery reference

Backups stream a consistent PostgreSQL custom dump into an encrypted local Restic repository. They contain all database records, not external files, source, configuration or the recovery password. Store the password and version information separately, off-server.

Run `docker compose exec backup bash /scripts/backup.sh once`. Check `/scripts/health.sh` and `/backups/.seekcost-success` inside the backup container for the successful timestamp and snapshot ID. Do not use latest: interrupted exports can leave incomplete snapshots. No automatic pruning; monitor storage.

Daily backups may lose about a day or more of changes. They are not PITR. Local backups are not disaster recovery. Optional OFFSITE_REPOSITORY uses your own S3 credentials and a pre-initialized Restic repository, with the same password file. Losing the password makes recovery impossible. Optional HTTPS status webhooks do not replace external missing-heartbeat monitoring.

Restore with `docker compose exec backup bash /scripts/restore.sh SNAPSHOT_ID seekcost_restore_drill1`. Only new recovery database names are accepted. The live database is never dropped or overwritten. Verify schema version, counts, recent records and permissions with the matching application version before manually switching API, migration and backup targets. Run periodic drills. Stub tests and repository integrity checks do not prove application-level recovery.

## References

- [PostgreSQL pg_dump](https://www.postgresql.org/docs/17/app-pgdump.html): consistent exports and supported formats.
- [PostgreSQL pg_restore](https://www.postgresql.org/docs/17/app-pgrestore.html): custom archive restoration.
- [Restic repository setup](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html): passwords and storage backends.
