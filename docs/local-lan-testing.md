# 局域网本地测试说明

本文用于在同一 Wi‑Fi 的另一台电脑上打开当前看板。它只适用于可信的私有网络，不提供登录、权限或 HTTPS。

## 1. 准备演示数据库

在仓库根目录执行：

```bash
npm ci
mkdir -p data
npm run db:migrate
npm run db:seed
```

如果需要从零开始重建**演示**库：

```bash
rm -f data/app.db
npm run db:migrate
npm run db:seed
```

不要用上述删除命令指向真实数据库或 `docs/evidence/`。

## 2. 启动局域网服务

```bash
DATABASE_PATH="$(pwd)/data/app.db" \
INGEST_TOKEN="local-demo-token" \
AI_ENABLED=false \
AI_ALLOW_REAL_DATA=false \
npm run dev -- --hostname 0.0.0.0 --port 3000
```

检查服务是否启动：

```bash
curl http://127.0.0.1:3000/api/health
```

## 3. 找到局域网地址

macOS 常用 Wi‑Fi 接口：

```bash
ipconfig getifaddr en0
```

如果没有返回地址，请在“系统设置 → 网络 → Wi‑Fi → 详细信息”查看 IPv4 地址。假设地址是 `192.168.1.23`，另一台电脑打开：

```text
http://192.168.1.23:3000
```

两台设备必须连接同一个 Wi‑Fi，且不能被访客网络或 AP 隔离阻断。macOS 第一次监听端口时，允许 Node.js 接收来自私有网络的连接。

## 4. 测试建议路径

1. `/settings`：确认六个主体和字段差异化显示。
2. `/`：确认看板、到期日和状态卡片。
3. `/import`：上传一份演示 CSV，检查三种日期格式和解析预览。
4. `/inbox`：确认待审核交易和已关账期间专区。
5. `/annual`：查看年度不含 GST 口径、资产折旧和信托分配。
6. `/div7a`：查看年度余额、利息、最低还款和协议义务。
7. `/super`：查看年度上限以及供款/通知两个独立待办。
8. `/news`：在 AI 关闭状态下确认资讯页面仍可用。

真实手机拍照、摄像头权限和移动端上传流程需要用户在手机上自行确认；自动化只覆盖响应式布局和普通浏览器流程。

## 5. 停止与清理

在运行服务的终端按 `Ctrl+C`。测试完成后如不再需要演示数据库，可手动删除 `data/app.db`；不要删除仓库内的 Gate 证据目录。
