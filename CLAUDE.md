# 数伴（MathFriend）

三年级数学教陪。一个仓库、两个应用：

- **家长端**（`server/`、`src/`）：只在本地 Mac 上跑。每周用 `/weekly` 归集扫描件里的错题（归集完自动生成孩子端题库文件 `孩子端题库/pack-周.json`，家长用孩子端管理员账号导入），`/weekly sheet` 出纸质辅导单。文件即数据：`错题/`、`知识点.md`、`辅导单/`、`孩子端题库/`（都在 .gitignore 里）。设计见 `PRD.md`。
- **孩子端**（`kid/`）：养柴犬做题，部署在 Netlify。两端只交换两种文件（标准见 `.claude/skills/weekly/rules.md` 第 10 节）：家长端每周导出题库文件，管理员在孩子端「导入题库」；管理员「导出答题记录」放进 `孩子端题库/`，家长端归集时读入。

**接手孩子端开发前，先读 [`kid/开发记录.md`](kid/开发记录.md)**：设计决定、分期计划、当前进度、怎么验证都在里面。做完一段工作后把进度和新决定写回这份记录。

## 必须遵守

- 这个仓库是**公开**的。不要提交 `错题/`、`辅导单/`、`原件/`、`孩子端题库/`、`public/site-data.json`、`public/attachments/` 里的任何内容，也不要把题库包（含答案）放进任何 `public/` 目录或提交。
- `kid/` 只能引用 `shared/`，不能引用 `server/`；`shared/` 不能引用另外两边。孩子端站点里不能出现错题和截图。
- 答案、陷阱值、金币结算只在后端（`kid/server/game.js`）。发给页面的题目必须经过 `shared/contract.js` 的 `publicItem()`。
- 孩子端的屏幕成绩只做参考：不并入纸面错误率，不参与「已改善」的判定。
- 不要手工改 `错题/*.md`，一切通过命令写入（`npm run ingest|sheet|kid`）。
- 在 `dev` 分支开发、推到 `dev`（不会部署）。家长确认没问题后，再把 `dev` 合并到 `uat` 统一发布：推到 `uat` 后 Netlify 自动部署孩子端，每次部署都耗 credit，不要零碎地推 `uat`。提交时只暂存本次改动的文件。
- `src/kid/` 和 `design/kid-v2/`（如果本地有）是另一条未提交的试验线，不属于现在的孩子端，不要改、不要提交。
- 家长偏好：尽量复用现有代码，少建新文件；界面和文档用中文，算式用 × ÷，不用 LaTeX。

## 常用命令

```bash
npm start                      # 家长端：构建并启动 http://localhost:5174
npm run kid:dev                # 孩子端本地开发 http://localhost:5175（孩子账号「宝贝」密码 1234，管理员 admin 密码 9999，同步令牌 dev，存档在系统临时目录）
npm run kid:build              # 孩子端构建到 dist-kid（Netlify 用）
npm run kid bank <周> <json>   # 模板入库并逐题验算
npm run kid export <周>        # 导出孩子端题库文件 孩子端题库/pack-周.json（每周固定做法，管理员导入）
# 出孩子端题库：在 Claude Code 里运行 /weekly kid，照 .claude/skills/weekly/rules.md 第 9 节「出题流程」五步做
npm run kid pull [周|文件]     # 读入答题记录：默认读 孩子端题库/ 里最新的 log-周-账号.json
npm run kid push <周>          # 设过孩子端地址时也可以直接在线推送（npm run kid check 看连不连得上）
npm run lint && npx tsc --noEmit -p .
```
