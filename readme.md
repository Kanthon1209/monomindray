# Mindray

单仓 monorepo：本地开发 → GitHub Actions 构建镜像 → ECS 只拉取运行。

## 目录

```text
apps/backend     Go (go-zero) API
apps/frontend    Next.js Web
deploy/          生产 / 本地 compose、Caddy、环境变量模板
.github/workflows  CI 与部署
specs/           需求与设计笔记
```

## 旧仓库与 Git 历史

| 原仓库 | 处理 |
|--------|------|
| `Kanthon1209/mindray-frontend` | **历史已保留**：本仓由该仓迁入，`apps/frontend/**` 可用 `git log --follow` 查看 |
| `Kanthon1209/mindray-backend` | 本地从未产生有效提交（`origin/main` 已失效），代码作为新文件并入 `apps/backend` |
| 远端旧仓 | 建议在 GitHub 上 **Archive**，README 指向本 monorepo；不要再向旧仓推送 |

本仓 remote：

- `origin` → `git@github.com:Kanthon1209/monomindray.git`
- `legacy-frontend` / `legacy-backend` → 旧仓（只读备份，勿再 push）

## 本地开发

```bash
# 1. 准备环境变量
cp deploy/.env.example deploy/.env

# 2. 整栈（含 Caddy :80）
docker compose -f deploy/docker-compose.dev.yml --env-file deploy/.env up --build

# 或：只起数据库，本机跑前后端
docker compose -f deploy/docker-compose.dev.yml --env-file deploy/.env up postgres
cd apps/backend && go run .
cd apps/frontend && npm ci && npm run dev
```

- API: `http://localhost:8080`
- Web: `http://localhost:3000`
- 经 Caddy: `http://localhost/api/...`、`http://localhost/`

## 生产（ECS）

服务器要求：**禁止**在 ECS 上 `docker compose build` / `npm ci` / `go build`。

```text
/home/kanthon/mindray/          # 本仓 clone
└── deploy/.env                 # 仅服务器保存密钥
```

首次：

```bash
git clone <monorepo-url> /home/kanthon/mindray
cd /home/kanthon/mindray/deploy
cp .env.example .env   # 填真实密钥与 SITE_ADDRESS
# 先由 CI 推好镜像，或临时手动 docker pull
IMAGE_TAG=<sha> docker compose up -d
```

之后由 GitHub Actions `ci-cd.yml` 自动：

```text
backend/frontend 检查通过 → 构建并推送 GHCR 镜像 → SSH → git pull → compose pull && up -d
```

PR 只跑检查，不部署；`push` 到 `main` 才会构建镜像并部署。

### GitHub Secrets

| Secret | 含义 |
|--------|------|
| `SSH_HOST` | ECS 主机 |
| `SSH_USER` | SSH 用户 |
| `SSH_PRIVATE_KEY` | 部署私钥 |
| `GHCR_USER` / `GHCR_PULL_TOKEN` | 若镜像私有，ECS 拉包用（公开包可省略 login） |

### Caddy

- 配置：`deploy/Caddyfile`
- 生产：改 `SITE_ADDRESS`（域名），开放 80/443，自动 HTTPS
- 路由：`/api/*` → `api:8080`（保留 `/api` 前缀，与后端 `/api/v1/...` 一致），其余 → `web:3000`
- 仅 Caddy 对外暴露端口

## 镜像

```text
ghcr.io/kanthon1209/mindray-api:<git-sha>
ghcr.io/kanthon1209/mindray-web:<git-sha>
```
