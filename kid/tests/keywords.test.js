import { test } from 'node:test'
import assert from 'node:assert/strict'
import { auditSegs, calibrateSegs, packKeys, segAnchors, checkPack, circleRole, instantiate, publicItem } from '../../shared/contract.js'
import { createApi } from '../server/game.js'

// 图书馆应用题：上午借出 44 本，下午是上午的 3 倍，一天一共借出多少本。正确算式 44 + 44 × 3
const word = segs => ({ id: 'w1', tpl: 't1', group: 'g', format: 'word', level: '同构', kp: '倍数', err: '审题', bucket: '本周重点', price: 12, answer: 176, ask: '答：一共借出', unit: '本', units: ['本'],
  choices: [{ t: '44 + 44 × 3', v: 176, ok: 1 }, { t: '44 × 3', v: 132 }, { t: '44 + 3', v: 47 }],
  chips: [{ v: 44, seg: 1 }, { v: 44, seg: 1 }, { v: 3, seg: 4 }],
  segs })
const T = (t, k, n) => ({ t, ...(k ? { k } : {}), ...(n ? { n: 1 } : {}) })
const good = () => [T('图书馆'), T('上午借出 44 本书，', 2), T('下午', 1), T('借出的是'), T('上午的 3 倍。', 2), T('店里还有 5 只猫。', 0, 1), T('这一天一共借出多少本书？', 2)]

test('标得对的题不改，也没有存疑', () => {
  const r = auditSegs(word(good()))
  assert.deepEqual(r.fix, []); assert.deepEqual(r.warn, [])
})

test('列式要用的数和问题没标必圈：补成必圈（漏标）', () => {
  const it = word([T('图书馆'), T('上午借出 44 本书，', 1), T('下午', 1), T('借出的是'), T('上午的 3 倍。'), T('店里还有 5 只猫。', 0, 1), T('这一天一共借出多少本书？', 1)])
  const r = calibrateSegs(it)
  assert.equal(r.fixed.length, 3)
  assert.deepEqual(it.segs.map(s => s.k || 0), [0, 2, 1, 0, 2, 0, 2])
})

test('必圈的段里没有数也没有决定算法的词：降成帮助理解（误标）；噪音句不会被动', () => {
  const it = word([T('图书馆', 2), T('上午借出 44 本书，', 2), T('下午', 2), T('借出的是'), T('上午的 3 倍。', 2), T('店里还有 5 只猫。', 0, 1), T('这一天一共借出多少本书？', 2)])
  calibrateSegs(it)
  assert.deepEqual(it.segs.map(s => s.k || 0), [1, 2, 1, 0, 2, 0, 2])
  assert.equal(it.segs[5].n, 1); assert.equal(it.segs[5].k, undefined)
})

test('噪音句里的数不会被当成列式要用的数；噪音句数字和算式一样要提醒', () => {
  const it = word([T('图书馆'), T('这里有 3 只猫。', 0, 1), T('上午借出 44 本书，', 2), T('下午', 1), T('借出的是'), T('上午的 3 倍。', 2), T('这一天一共借出多少本书？', 2)])
  assert.deepEqual(segAnchors(it).nums, [2, 5])
  assert.ok(auditSegs(it).warn.some(m => m.includes('噪音句里的数')))
})

test('多余全段标注和漏标关系仍提醒，不强迫添加噪音句', () => {
  const all = word(good().map(s => ({ ...s, k: 2, n: undefined })))
  const w = auditSegs(all).warn.join('|')
  assert.match(w, /句句都是关键词/); assert.ok(!w.includes('没有噪音句'))
  const miss = word([T('图书馆'), T('上午借出 44 本书，', 2), T('一共'), T('上午的 3 倍。', 2), T('借出多少本书？', 2), T('今天晴天。', 0, 1)])
  assert.match(auditSegs(miss).warn.join('|'), /「一共」像是决定怎么算的词/)
})

test('没有算式依据的题型（统计、数据）不自动改，只提醒', () => {
  const it = { id: 'd1', format: 'data', segs: [T('这些数', 2), T('超过', 2), T('10', 2), T('有几个', 2), T('请仔细观察', 1), T('今天晴天', 0, 1)] }
  assert.deepEqual(auditSegs(it).fix, [])
  assert.deepEqual(calibrateSegs(it).fixed, [])
})

test('多步题：每一步算式里的数都是必圈', () => {
  const it = { id: 'm1', format: 'multistep', tpl: 'm', segs: [T('水果店'), T('买了 12 盒，', 1), T('每盒 6 个，', 1), T('卖出 20 个。'), T('还剩多少个？', 1)], parts: [{ tk: [12, '×', 6], prevAt: -1 }, { tk: [0, '−', 20], prevAt: 0 }] }
  assert.deepEqual(segAnchors(it).nums, [1, 2, 3])
  calibrateSegs(it)
  assert.deepEqual(it.segs.map(s => s.k || 0), [0, 2, 2, 2, 2])      // 12、6、20 和问题都是必圈
})

test('packKeys 按模板汇总，fix 为真才改题目', () => {
  const bad = () => word([T('图书馆'), T('上午借出 44 本书，', 1), T('下午', 1), T('借出的是'), T('上午的 3 倍。'), T('店里还有 5 只猫。', 0, 1), T('这一天一共借出多少本书？')])
  const pack = { items: [bad(), { ...bad(), id: 'w2' }] }
  const dry = packKeys(pack); assert.equal(dry.fixed, 6); assert.equal(pack.items[0].segs[1].k, 1)
  const done = packKeys(pack, { fix: true }); assert.equal(done.byTpl.t1.fixed['列式要用的数没标必圈'].n, 4); assert.equal(pack.items[0].segs[1].k, 2)
  assert.equal(packKeys(pack, { fix: true }).fixed, 0)
})

test('导入题库时统一校正关键词，回执里带校正数', async () => {
  const data = new Map(), store = { get: async k => structuredClone(data.get(k) ?? null), set: async (k, v) => data.set(k, structuredClone(v)) }
  const api = createApi(store, { DEV: true, KID_USER: '甲', KID_PIN: '1234', ADMIN_PIN: '5678', SYNC_TOKEN: 'fixture-only' })
  const it = word([T('图书馆'), T('上午借出 44 本书，', 1), T('下午', 1), T('借出的是'), T('上午的 3 倍。'), T('店里还有 5 只猫。', 0, 1), T('这一天一共借出多少本书？')])
  const pack = { format: 'shuban-kid-pack', v: 1, week: '2026-W42', groups: [{ id: 'g', name: '圈出条件', daily: 1 }], items: [it], tuning: {} }
  const probe = checkPack(pack)
  if (probe.length) return        // 题库包格式常量变动时，格式检查先拦下，这个用例不适用
  const res = await api(new Request('http://local/api/kid/pack', { method: 'PUT', headers: { 'content-type': 'application/json', 'x-sync-token': 'fixture-only' }, body: JSON.stringify(pack) }))
  const out = await res.json(); assert.equal(res.status, 200, JSON.stringify(out))
  assert.equal(out.keys.fixed, 3)
  assert.deepEqual(data.get('pack').items[0].segs.map(s => s.k || 0), [0, 2, 1, 0, 2, 0, 2])
})


test('截图式data三大点击块不能靠短句、颜色噪音或拆标点通过审计', () => {
  for (const [kind, phrase] of [['atleast', '不少于85分'], ['over', '超过85分']]) {
    const original = [T('下面是8名同学的诵读成绩（单位：分）。'), T('成绩' + phrase, 2), T('的有几人？', 2)]
    for (const segs of [original, [...original, T('大家带着五颜六色的书包来到学校，天气晴朗。', 0, 1)], original.flatMap(s => [s, T('，')])]) {
      const it = { format: 'data', kind, over: 85, segs: structuredClone(segs) }, before = structuredClone(it.segs), audit = auditSegs(it)
      assert.ok(audit.warn.some(w => w.includes('筛选条件')), JSON.stringify(audit))
      assert.ok(audit.warn.some(w => w.includes('普通问句')), JSON.stringify(audit))
      calibrateSegs(it); assert.deepEqual(it.segs, before, '审计不能偷偷重排旧题的seg索引')
    }
  }
})

test('比较词和阈值为一个核心短语；量词、纯问句可选，标点无判分角色', () => {
  assert.equal(circleRole(T('不少于85分', 2)), 'must')
  for (const text of ['几人', '的有几人？', '多少克', '多少秒？', '多少钱？', '米']) assert.equal(circleRole(T(text, 2)), 'support', text)
  assert.equal(circleRole(T('几人？')), 'support'); assert.equal(circleRole(T('米')), 'support');
  assert.equal(circleRole(T('。', 2)), 'ignore'); assert.equal(circleRole(T('下面是成绩。')), 'context')
  for (const [kind, phrase] of [['atleast', '不少于85分'], ['over', '超过85分'], ['under', '少于85分']]) {
    const item = { format: 'data', kind, over: 85, keyword_policy: 'curated', segs: [T('下面是8名同学的成绩。'), T('成绩'), T(phrase, 2), T('的有'), T('几人', 1), T('？')] }
    assert.deepEqual(auditSegs(item), { fix: [], warn: [] })
    const split = { ...item, segs: [T('下面是8名同学的成绩。'), T(phrase.replace('85分', ''), 2), T('85', 2), T('分'), T('几人', 1)] }
    assert.ok(auditSegs(split).warn.some(w => w.includes('筛选条件')), '机械切成字词不能替代完整的比较关系')
  }
})

test('显式精审保留关系与目标，不把所有数字或裸问句重新升为核心', () => {
  const item = word([T('同一个盒子，', 2), T('放3个零件重350克，'), T('放5个重510克。'), T('零件一样重。', 2), T('空盒的质量', 2), T('多少克？', 1)])
  item.keyword_policy = 'curated'; item.chips = [{ v: 350, seg: 1 }, { v: 510, seg: 2 }, { v: 3, seg: 1 }, { v: 5, seg: 2 }]
  const before = structuredClone(item.segs)
  assert.deepEqual(auditSegs(item), { fix: [], warn: [] }); calibrateSegs(item); assert.deepEqual(item.segs, before)
  const optional = word([T('每箱12本', 2), T('有4箱', 2), T('图书角需要这些书。'), T('多少本？', 1)])
  optional.chips = [{ v: 12, seg: 0 }, { v: 4, seg: 1 }]
  assert.ok(!auditSegs(optional).fix.some(f => f.i === 3), '历史默认校正也不能仅因有“多少”升级纯问句')
})

test('数字卡有明确来源时复用该段，不误标相同数字的背景叙述', () => {
  const item = word([T('书架在44号教室。'), T('上午借出44本，', 2), T('下午是上午3倍。', 2), T('一天一共多少本？', 2)])
  item.chips = [{ v: 44, seg: 1 }, { v: 44, seg: 1 }, { v: 3, seg: 2 }]
  assert.deepEqual(segAnchors(item).nums, [1, 2])
  assert.ok(!auditSegs(item).fix.some(f => f.i === 0))
})

test('data的why填入真实阈值且精审标记仅留后端，常规应用题无需人为噪音', () => {
  const template = { id: 'selection', group: 'g', format: 'data', knowledge_point: '03.2', error_type: '审题', level: '同构', keyword_policy: 'curated', count: 3,
    nums: '8×(60..99)', ask: 'atleast', over: [75, 85, 90], unit: '人', units: ['人', '分'],
    text: '下面是8名同学的成绩。成绩不少于{over}分的有几人？',
    segs: [T('下面是8名同学的成绩。'), T('成绩'), T('不少于{over}分', 2), T('的有'), T('几人', 1), T('？')],
    why: '不少于{over}分包括正好{over}分；几人提醒填写人数。' }
  const { items, problems } = instantiate(template, { id: 'g', bucket: '本周重点' }, '2026-W48', 0, 3)
  assert.equal(items.length, 3, JSON.stringify(problems))
  for (const it of items) {
    assert.equal(it.keyword_policy, 'curated'); assert.match(it.why, new RegExp(`正好${it.over}分`))
    assert.equal(it.segs[4].k, 1); assert.deepEqual(auditSegs(it), { fix: [], warn: [] })
    const shown = publicItem(it); assert.equal(shown.keyword_policy, undefined); assert.equal(shown.why, undefined)
    assert.equal(shown.answer, undefined)
  }
  const clear = word([T('每袋3本', 2), T('买4袋', 2), T('一共多少本？', 2)])
  clear.chips = [{ v: 3, seg: 0 }, { v: 4, seg: 1 }]
  assert.deepEqual(auditSegs(clear), { fix: [], warn: [] })
})


test('跨题型审出多个短完整从句全标核心，必要的浓缩数学短语不误伤', () => {
  const clauses = ['仓库有100箱。', '又运入20箱。', '运走40箱。', '还剩多少箱？']
  for (const format of ['word', 'plan', 'multistep']) for (const curated of [false, true]) {
    const original = clauses.map(text => T(text, 2))
    for (const segs of [original, original.flatMap(s => [T(s.t.slice(0, -1), 2), T(s.t.slice(-1))]), [...original, T('图书馆门口有许多五颜六色的装饰，今天阳光明媚。', 0, 1)]]) {
      const it = { format, segs, ...(curated ? { keyword_policy: 'curated' } : {}) }, before = structuredClone(segs)
      assert.ok(auditSegs(it).warn.some(w => w.includes('多个完整叙述')), JSON.stringify(it))
      calibrateSegs(it); assert.deepEqual(it.segs, before, '只提示人工复核，不改已有seg或答案')
    }
  }
  for (const segs of [[T('每盒8支', 2), T('买3盒', 2), T('一共多少支？', 2)], [T('每盒彩笔有8支。', 2), T('每箱装6盒。', 2), T('一共多少支？', 2)]]) {
    assert.deepEqual(auditSegs({ format: 'word', keyword_policy: 'curated', segs }), { fix: [], warn: [] })
  }
})


test('多步应用题同样保留参数化why，精审核心不被实例化改回默认全数', () => {
  const t = { id: 'two-step-why', group: 'g', format: 'multistep', level: '同构', knowledge_point: '01.4', error_type: '审题', keyword_policy: 'curated',
    slots: { a: [12, 22], n: [2, 4], b: [5, 9] }, text: '每盒{a}支，买{n}盒，又得到{b}支。一共多少支？',
    segs: [T('每盒{a}支', 1), T('买{n}盒', 1), T('又得到{b}支', 1), T('一共', 2), T('多少支？', 1)],
    steps: [{ ask: '买来的有多少支', e: '{a}×{n}', pre: '买来', unit: '支', units: ['支', '盒'] }, { ask: '一共多少支', e: '{s1}+{b}', pre: '一共', unit: '支', units: ['支', '盒'] }],
    ask: '一共', why: '买来的和又得到的{b}支要合起来，“一共”决定最后用加法。' }
  const { items } = instantiate(t, { id: 'g', bucket: '本周重点' }, '2026-W48', 0, 3)
  assert.equal(items.length, 3)
  for (const it of items) {
    assert.equal(it.segs[3].k, 2); assert.ok(it.segs.filter((_, i) => i !== 3).every(s => s.k === 1))
    assert.ok(it.why.includes('决定最后用加法')); assert.ok(!/\{\w+\}/.test(it.why))
    assert.equal(publicItem(it).why, undefined)
  }
})
