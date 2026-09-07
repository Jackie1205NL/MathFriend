import fs from 'node:fs'
import path from 'node:path'

const dist = path.resolve('dist')
const client = path.join(dist, 'client')
fs.mkdirSync(client, { recursive: true })
for (const name of ['index.html', 'assets', 'attachments', 'site-data.json']) {
  const source = path.join(dist, name)
  if (fs.existsSync(source)) fs.renameSync(source, path.join(client, name))
}
fs.mkdirSync(path.resolve('dist/server'), { recursive: true })
fs.copyFileSync(path.resolve('server/site-worker.js'), path.resolve('dist/server/index.js'))
