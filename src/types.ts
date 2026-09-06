export type PageId = 'week' | 'progress' | 'mistakes' | 'knowledge' | 'settings'

export const ERROR_TYPES = ['计算失误', '审题', '概念不清', '格式规范', '漏题', '策略缺失'] as const
export type ErrorType = typeof ERROR_TYPES[number] | '待确认'

export interface Material { file: string; type: string; source: string; pages: number; questions: number; score: string; week_of: string }

export interface Mistake {
  id: string; week: string; date: string; source_type: string; source_name: string; source_weight: number
  knowledge_point: string; error_type: ErrorType; error_type_secondary: string
  graded_by: '老师' | '参考答案' | 'AI'; grade_conflict: boolean; verdict: 'wrong' | 'correct'; ai_verdict: string; teacher_mark: string
  confidence: number; ahead: boolean; teacher_score: string; file: string
  problem: string; student_answer: string; corrected_answer: string; correct_answer: string; analysis: string; coach_prompt: string
}

export interface PracticeItem { kind: 'calc' | 'word'; level: string; text: string; expression: string; answer: number; unit?: string; hint?: string }
export interface PracticeSet { topic: string; scope: '错题' | '预习'; items: PracticeItem[] }
export interface WeekData { week: string; materials: Material[]; attempts: Record<string, number>; entries: Mistake[]; preview: string[]; practice: PracticeSet[] }

export interface KnowledgeNode { id: string; title: string; unit: string; unitTitle: string; manual: boolean; core: string; example: string; guide: string; pitfalls: string }
export interface Knowledge { units: { id: string; title: string; type: string }[]; nodes: KnowledgeNode[] }

export interface ProgressPoint { week: string; attempts: number; mistakes: number; rate: number | null }
export interface ProgressRow { knowledge_point: string; title: string; unit: string; error_type: string; series: ProgressPoint[]; state: '需关注' | '练习中' | '已改善' | '未验证'; current: ProgressPoint; previous: ProgressPoint | null }

export interface Settings { keep: string[] }

/** 从学习进度下钻到错题本时带过去的筛选条件 */
export interface Drill { knowledge_point?: string; error_type?: string; unit?: string; source?: string }

export interface State {
  week: string; weeks: string[]; current: string; knowledge: Knowledge; data: WeekData; all: WeekData[]
  progress: { baseline: string | undefined; rows: ProgressRow[] }
  focus: (ProgressRow & { entries: string[] })[]
  originals: { file: string; size: number; ageDays: number; permanent: boolean; expiring: boolean; week: string | null }[]
  inbox: string[]; sheet: boolean; settings: Settings
}
