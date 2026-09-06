import { BookOpen, CalendarDays, ChartNoAxesCombined, LibraryBig, Settings } from 'lucide-react'
import type { PageId } from '../types'

export const navIcons: Record<Exclude<PageId, 'settings'>, typeof CalendarDays> = {
  week: CalendarDays, progress: ChartNoAxesCombined, mistakes: BookOpen, knowledge: LibraryBig,
}

export { Settings }
