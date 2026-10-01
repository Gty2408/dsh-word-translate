# 发布到 DSH 插件市场

**结论先说：DSH 没有"一键上传"。** 上架是两步，且第二步的投稿就是**一个 YAML 文件**。

```
① 代码放进 GitHub 仓库        →  别人能用 dsh plugin add 装
② 提一个 PR 加一个 YAML 文件  →  别人能在市场里搜到
```

合并后市场**自动收录**，通常一天内生效。

> **不要**往 `dsh-market` 仓库提插件条目——那是市场应用本身。插件目录的唯一来源是
> [awesome-dsh-plugin](https://github.com/Gty2408/dsh-word-translate)。

---

## 第 0 步：把占位符换成真实地址

仓库建好后，把 `Gty2408/dsh-word-translate` 替换成实际值。需要改 3 个地方：

| 文件 | 改什么 |
|---|---|
| `package.json` | `repository.url`、`homepage`、`bugs.url` 里的 `Gty2408/dsh-word-translate` |
| `Gty2408/dsh-word-translate` | `url` 和 `name` |

**`repository.url` 必须指回上架的那个仓库**，否则 npm 包和仓库不会关联
（官方刻意这么设计，防止包挂到未认领的仓库上）。

---

## 第 1 步：建仓库并推送

```sh
cd dsh-word-translate

git init
git add .
git commit -m "feat: contextual English translation with offline dictionary and history"

# 在 GitHub 网页上建一个空仓库（不要勾选 README/gitignore），然后：
git remote add origin https://github.com/Gty2408/dsh-word-translate
git branch -M main
git push -u origin main
```

**然后给仓库加 topic**（收录要求之一）：

> 仓库页面 → 右上角 ⚙️ (About) → Topics → 添加 **`dsh-plugin`**

---

## 第 2 步：提 PR 加一个文件

1. **Fork** `https://github.com/Gty2408/dsh-word-translate`
2. 在 fork 里新建文件：

   ```
   data/plugins/<owner>__<repo>.yml
   ```

   ⚠️ 文件名用**双下划线**连接 owner 和 repo。例如仓库是
   `github.com/Gty2408/dsh-word-translate`，文件名就是
   `gty__dsh-word-translate.yml`。

3. 内容复制 `Gty2408/dsh-word-translate` 里 `---` 分隔线**下方**的部分
   （把 `Gty2408/dsh-word-translate` 换成真实值）。

4. 提 PR。

**不要**编辑那个仓库的 README——两个 README 都是从 `data/plugins/*.yml`
生成的，合并后会自动重建。手动改反而会导致冲突。

---

## 第 3 步（可选）：发到 npm

**收录不依赖它**，发不发都能上架。好处是市场能显示下载量。

```sh
npm login
npm publish --access public
```

这个插件**零运行时依赖**，所以发布和安装都不需要 `allowBuilds` 构建授权——
比需要编译的插件省事。

---

## 当前状态自检

| 官方要求 | 状态 |
|---|---|
| `package.json` 声明 `dsh.bundle` manifest | ✅ |
| `cordis.patch.yml` 存在 | ✅ |
| 有真实可用代码 | ✅ lib/ 120 KB，7 个测试套件 |
| `keywords` 含 `dsh-plugin` | ✅ |
| MIT 协议 + LICENSE 文件 | ✅ |
| `repository` 字段 | ✅（占位符待替换） |
| GitHub 仓库 | ⏳ 待建 |
| 仓库加 `dsh-plugin` topic | ⏳ 待加 |
| 仓库创建满 **1 天** | ⏳ 建完等一天 |
| 描述准确、无营销词 | ✅ 见 YAML 注释里的逐条对应 |

> 官方特别提醒：**最常见的被拒原因是只声明了 `dsh.client`**——那样无法安装。
> 本插件两个都声明了，不受影响。

---

## 收录之后

市场从 `Gty2408/dsh-word-translate` 实时拉取，CI 每日刷新。
合并 PR 后**不需要**做任何额外操作。

**关于国内网络**：那个域名在这台机器上超时（可能被墙）。市场本身有兜底——
中国大陆优先从 npm 读同一份目录。如果市场加载不出来，可以指向镜像：

```sh
DSHM_REGISTRY_URL=https://your-mirror.example/plugins.json dsh web
```

---

## 环境备注

| 工具 | 状态 |
|---|---|
| `git` | ✅ 已装 |
| `gh` CLI | ❌ 未装（可选，装了能省掉网页操作） |
| npm registry | ✅ 通（npmmirror 561ms / npmjs 1838ms） |

想装 `gh` 的话：

```sh
winget install GitHub.cli
gh auth login
```

装好后第 1、2 步都能在命令行完成，但**仍需手动加 topic 和等满 1 天**。
