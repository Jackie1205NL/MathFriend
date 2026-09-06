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
