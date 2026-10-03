# 数伴

面向家长的三年级数学教陪助手，按 [PRD.md](PRD.md) 实现。全部在家里一台电脑上运行，文件即数据：

```
inbox/      放扫描件，归集后自动清空
原件/       重命名后的原件，60 天后自动删除（参考答案、标记保留的除外）
错题/       每周一个 md + 一个截图目录
知识点.md   大纲与知识点，单文件
辅导单/     每周一个 PDF（概览、讲解、练习卷、答案）
```

## 运行

需要 macOS 自带的 Ghostscript（`brew install ghostscript`）用于 PDF 分页。

```bash
npm install
npm start                                  # 构建前端并启动 http://localhost:5174
```

每周流程：把扫描件放进 `inbox/`，在这个项目目录打开 Claude Code，运行

```
/weekly
```

Claude 会分页看图、识别错题并落库（不需要任何 API key，规则在 `.claude/skills/weekly/rules.md`），没有人工确认环节。然后运行 `/weekly sheet 2026-W37` 出练习题并生成辅导单。其他家长用同一密码在手机或电脑上打开页面，可翻看往期并下载辅导单 PDF 打印。页面上没有导入或触发按钮。

底层命令（skill 会自己调用）：`npm run ingest prepare` / `npm run ingest apply` / `npm run sheet plan|practice|build <周>`。

课本单元跑在课堂进度前面时，这些知识点会自动进入「下周预习」，辅导单里带讲解和预习练习。

开发时分别运行 `npm run server` 与 `npm run dev`（前端 5173 代理到 5174）。

默认家庭密码 `1234`，在设置页修改。设置与缓存保存在 `~/Library/Application Support/shuban/`，不写进项目文件夹。

## 与 PRD 的已知差距

- 图片长边压到 1600px 并保留彩色，因为红笔批改是判题依据；不跑本地 OCR。
- 考试卷专项分析属于 V2，未实现。

## 孩子端（养柴犬）

孩子端是一只靠做题养大的柴犬，部署在 Netlify，家长端仍只在本地运行。两端只交换两样东西：家长每周推送题库包，孩子端的答题记录每周取回。

```
shared/contract.js   两端共用：题库包格式、题型、金币和照顾规则、模板实例化
kid/                 孩子端：页面（src/）、判分和存档（server/game.js）、Netlify 函数（functions/）
server/kid.js        家长端命令：bank / pack / push / pull / link
```

`kid/` 只能引用 `shared/`，不能引用 `server/`，所以孩子端站点里没有错题和截图。题库包含答案，只走接口进 Netlify Blobs，不放进 `public/`。

**部署（一次）**：Netlify 里新建站点，连这个仓库，分支选 `uat`（或 `main`），构建设置由 `netlify.toml` 决定。在站点的环境变量里加 `KID_PIN`（孩子进小屋的口令）和 `SYNC_TOKEN`（一串随机字符）。然后在本机运行：

```bash
npm run kid link https://你的站点.netlify.app 你的SYNC_TOKEN
```

**每周**：`/weekly sheet <周>` 会顺便取回上周答题、写题库模板并推送，规则在 `.claude/skills/weekly/rules.md` 第 9 节。也可以手动运行 `npm run kid pull|bank|push <周>`。

**本地开发**：`npm run kid:dev` 打开 http://localhost:5175 ，自带后端（存档在系统临时目录），口令 1234，同步令牌 dev。小狗的图在 `kid/public/pet/`，原图在 `design/pet/src/`，换了原图后运行 `npm run kid:assets` 重新切图。

