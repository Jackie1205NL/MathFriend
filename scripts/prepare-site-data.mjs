import fs from 'node:fs'
import path from 'node:path'
import * as store from '../server/store.js'
import { plan } from '../server/sheet.js'

const output = path.resolve('public')
const copy = (from, to) => {
  if (!fs.existsSync(from)) return
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

const weeks = store.listWeeks()
const current = store.isoWeek()
const knowledge = store.readKnowledge()
// 只读站点不带孩子端题库模板（能推出答案）
const strip = ({ bank: _bank, ...w }) => w
const all = weeks.map(store.readWeek).map(strip)
const week = weeks.at(-1) || current
const data = strip(store.readWeek(week))
const { password: _password, secret: _secret, ...settings } = store.loadSettings()
const focus = plan(week).focus.map(({ entries, ...row }) => ({ ...row, entries: entries.map(entry => entry.id) }))

fs.rmSync(output, { recursive: true, force: true })
fs.mkdirSync(output, { recursive: true })
fs.writeFileSync(path.join(output, 'site-data.json'), JSON.stringify({
  week, weeks, current, knowledge, data, all,
  progress: store.computeProgress(weeks.filter(value => value <= week), knowledge),
  focus, originals: store.listOriginals(), inbox: [],
  sheet: fs.existsSync(path.join(store.DIRS.sheets, `${week}.pdf`)), settings,
}))

for (const entry of all.flatMap(item => item.entries)) {
  copy(path.join(store.DIRS.mistakes, entry.week, `${entry.id}.png`), path.join(output, 'attachments/images', entry.week, `${entry.id}.png`))
}
for (const item of all) {
  copy(path.join(store.DIRS.sheets, `${item.week}.pdf`), path.join(output, 'attachments/sheets', `${item.week}.pdf`))
}
