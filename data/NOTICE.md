# 词典数据来源

`dict.json` 由 `tools/build-dict.mjs` 从 **ECDICT** 构建而来，**不是**本项目原创数据。

| 项目 | 说明 |
|---|---|
| 上游项目 | ECDICT — <https://github.com/skywind3000/ECDICT> |
| 协议 | **MIT** |
| 上游版本 | 1.0.28（构建时取 master 分支的 `ecdict.csv`） |
| 原始规模 | 770,611 词条 / 62.9 MB |
| 构建产物 | 26,974 词条 + 27,241 个屈折形式 / 3.05 MB |

## 保留了什么

只保留"学习者查得到"的词，判据用 ECDICT 自带的评级，不另造标准：

- 有 Collins 星级，或
- 是 Oxford 3000 词，或
- 带考试标签（zk/gk/cet4/cet6/ky/toefl/ielts/gre），或
- BNC 或 COCA 词频排名在前 20000

每个词条保留：音标、中文释义（最多 4 个义项、160 字）、词性、Collins 星级、
Oxford 标记、考试标签、BNC/COCA 词频。

## 关于词频

词频排名来自 ECDICT 的 `bnc` / `frq` 字段。**数字越小越常用**——这是本插件
最有价值的学习信号：它直接回答"这个词值不值得记"。

## 重新构建

```bash
# 下载上游数据（国内可用 gh-proxy 镜像加速）
curl -L -o ref/ecdict/ecdict.csv \
  https://gh-proxy.com/https://raw.githubusercontent.com/skywind3000/ECDICT/master/ecdict.csv

# 构建
node tools/build-dict.mjs
```

## 协议合规

ECDICT 是 MIT 协议，允许再分发与修改，条件是**保留版权声明**。本文件即该声明。
若你要再分发本插件，请一并保留本文件。
