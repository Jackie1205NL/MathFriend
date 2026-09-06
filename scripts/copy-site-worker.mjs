import fs from 'node:fs'
import path from 'node:path'

fs.mkdirSync(path.resolve('dist/server'), { recursive: true })
fs.copyFileSync(path.resolve('server/site-worker.js'), path.resolve('dist/server/index.js'))
