# 镜像仓库 Release Workflow

_EndFieldGameData 镜像仓库（`3aKHP/EndFieldGameData`）的发布契约与 CI 设计。
镜像仓库本身是独立项目；本文档记录它发布的 zip 结构、版本号约定，以及未来
自动化导出的 CI 设计参考。_

## 仓库定位

镜像仓库的目标：**定期从 endfield_research_kit 的导出产出中，凝练出纯文本 JSON
表格，打包成 GitHub Release asset 供 EndField-MCP 同步消费**。

关键约束（与 ROADMAP.md / docs/dev/STYLE.md 一致）：

- 只发布**纯文本 JSON 表格**，不发布二进制资产（贴图、音频、模型）。
- 不再分发 endfield_research_kit 的原始导出物（上游明确禁止）。
- 体积控制在几十 MB 级别（GitHub Release 单 asset 上限是 2GB，足够）。
- tag 用裸 semver：`v0.2.0`、`v0.3.0` 等。

## 当前发布状态

镜像已实装，截至本文档更新时发布了两版：

| Release | Asset | 内容 | 对应 EndField-MCP 版本 |
|---------|-------|------|----------------------|
| v0.2.0 | `endfield-tables.zip` | 10 核心表 + 5 语言 i18n（~15-20MB） | 0.2.0+ |
| v0.3.0 | `endfield-story-CN.zip` | 剧情对话 9271 场景 + 目录（~19MB） | 0.3.0+ |

## zip 结构契约

镜像仓库发布的 zip 内部结构必须与 EndField-MCP 的 `ts/src/data/datasets.ts`
里 `requiredFiles` 的路径**完全一致**。两个 dataset 的契约如下：

### `endfield-tables.zip`

```
endfield-tables.zip
├── tables/                          # 顶层目录，与 TABLE_FILES 前缀对应
│   ├── CharacterTable.json          # PascalCase，与 endfield_research_kit 导出名一致
│   ├── EnemyTable.json
│   ├── EnemyTemplateTable.json
│   ├── EnemyDisplayInfoTable.json
│   ├── EquipTable.json
│   ├── EquipItemTable.json
│   ├── CharProfessionTable.json
│   ├── CharTypeTable.json
│   ├── CharacterTagTable.json
│   └── ItemTable.json
└── i18n/                            # 5 语言本地化（从 I18nTextTable_<LANG>.json 重命名）
    ├── CN.json
    ├── EN.json
    ├── JP.json
    ├── TC.json
    └── KR.json
```

表名采用 **PascalCase**（`CharacterTable.json`），与 endfield_research_kit
导出的原始文件名一致。i18n 文件名从上游 `I18nTextTable_<LANG>.json` 简化为
`<LANG>.json`。

### `endfield-story-CN.zip`

```
endfield-story-CN.zip
├── index.json                       # 场景目录（catalog）
├── missions.json                    # 任务元数据
├── actors.json                      # 说话者索引
├── search.json                      # 全文检索索引
└── conv/                            # 9271 个对话场景文件，按需读取
    └── <sceneKey>.json
```

catalog 四文件**平铺在 zip 根**（不在子目录），`conv/` 是唯一子目录。`requiredFiles`
只校验四个 catalog 文件——`conv/` 内 9271 个文件不逐一校验（启动时成本太高），
但 CD 流水线会断言至少存在一个 conv 文件作为完整性兜底。

## 版本号策略

- 主版本号跟随 EndField-MCP 的 minor：v0.2.x 镜像对应 EndField-MCP 0.2.x。
- 镜像独立 patch：游戏更新但 schema 没变 → patch +1（如 v0.2.1）。
- schema 有 breaking 变化 → minor +1（如 v0.3.0），同步更新 EndField-MCP 的
  `requiredFiles` 和 reader。
- 镜像与 EndField-MCP 不强绑定发布节奏：镜像可先行发布（如 story 在 EndField-MCP
  0.3.0 前的镜像 v0.3.0 Release），EndField-MCP 升级 datasets.ts 后才开始消费。

## 消费侧链路（EndField-MCP）

EndField-MCP 这侧的 `GAMEDATA_TABLES.requiredFiles` / `STORY_CN.requiredFiles`
（见 `ts/src/data/datasets.ts`）写成上述路径前缀，`localRoot` 解压后直接读
`<localRoot>/tables/CharacterTable.json` 等。同步层 `data/sync.ts` 负责：
下载 → 校验 requiredFiles → 原子解压 → 清缓存。

### 镜像级联

`sync.ts` 支持 `GITHUB_MIRRORS` 环境变量配置 ghproxy 风格的代理 URL。对于
GitHub Release 的下载，国内用户可以配：

```
GITHUB_MIRRORS=https://ghproxy.net
```

镜像仓库的 Release asset 下载 URL 是
`github.com/<owner>/<repo>/releases/download/<tag>/<asset>.zip`，
ghproxy 会自动代理。注意：代理 URL **不要带尾部斜杠**。

## 未来：自动导出 CI（未实装）

当前镜像是**手动导出 + 手动发布**（选项 B）：维护者在本地跑 endfield_research_kit
导出，用 `ts/scripts/build-mirror-zip.ts` / `build-story-zip.ts` 打包，手动
`gh release create` 发布。这个节奏足够 v0.2/v0.3 的更新频率。

当社区对镜像有稳定、高频的更新需求时，再升级到自动化。自动化面临的核心障碍是：
endfield_research_kit 需要**本地的终末地客户端**才能导出——游戏客户端数十 GB，
GitHub-hosted runner 上没有，每次重装不现实。

### 选项 A：self-hosted runner（自动化目标）

在本地（或专用机器）配置一个 GitHub Actions self-hosted runner，常驻游戏客户端。
镜像仓库的 export job 用 `runs-on: self-hosted` 跑。优点是游戏客户端常驻、导出快、
可定时（每周）自动检查游戏更新并重导出；缺点是要维护一台常开机的主机。

工作流大致：

```yaml
on:
  schedule:
    - cron: "0 2 * * 1"   # 每周一 UTC 02:00（北京时间 10:00）
  workflow_dispatch:       # 手动触发，可带 force 参数

jobs:
  export:
    runs-on: self-hosted   # 常驻游戏客户端的主机
    steps:
      # 1. 跑 endfield_research_kit export.bat --export-from-game
      # 2. 从 export_full/structured/StreamingAssets/Table/ 挑出关心的 JSON
      # 3. 用 build-mirror-zip.ts / build-story-zip.ts 打包
      # 4. 计算 zip 的 sha256，与上一次 Release 比对，相同则跳过
      # 5. 不同则 gh release create 发布新版本
```

### 选项 B：手动导出（当前方式）

维护者本地导出 + 手动打 Release。CI（如果未来加）只负责"比对 sha + 打 Release"
的后半段。更新节奏取决于维护者手动跑的频率。这是当前实装的方式。

## 待决事项（自动化落地时再定）

- [ ] 选项 A（self-hosted runner）何时启用——等更新频率需求出现
- [ ] 定时触发的 cron 周期——取决于游戏更新节奏
- [ ] self-hosted runner 的主机选址与维护责任

zip 结构、owner/repo、版本号策略等**消费侧契约**已在上文锁定，不再列为待决项。
