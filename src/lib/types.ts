/** 앱 전체에서 쓰는 데이터 모델. 날짜 키는 항상 'YYYY-MM-DD' (로컬 기준). */

export type ISODate = string

/** 1~5 단계 척도. 컨디션, 식사량, 영양 섭취 등에 공통으로 쓴다. */
export type Level = 1 | 2 | 3 | 4 | 5

export type Intensity = 'low' | 'mid' | 'high'

export interface Todo {
  id: string
  text: string
  done: boolean
  createdAt: number
  /** 목록에서의 자리. 할 일과 일정이 한 목록이라 둘이 같은 눈금을 쓴다. */
  order: number
}

export interface Idea {
  id: string
  text: string
  /** 기록한 시각 (epoch ms). 아이디어는 "그때그때" 남기는 것이라 시각을 같이 보관한다. */
  at: number
}

export interface Person {
  id: string
  name: string
  /** 자유 입력. '대학교 친구', '가족', '직장 동료' 등 사용자가 알아서 적는다. */
  relation: string
  /** 프로필 색상 인덱스 (PERSON_COLORS 참조) */
  colorIndex: number
  createdAt: number
  /** 기기 간 최신본 판정 기준 */
  updatedAt: number
}

/** 특정 날짜에 특정 인물과 있었던 일. */
export interface Interaction {
  id: string
  personId: string
  note: string
  at: number
}

export interface Meal {
  id: string
  /** '아침' | '점심' | '저녁' | '간식' 또는 자유 입력 */
  label: string
  /** 먹은 양 1(아주 적게) ~ 5(아주 많이) */
  amount: Level
  /** 'HH:MM'. 몇 시에 먹었는지 */
  time: string | null
}

export interface Sleep {
  /** 잔 시간(시간 단위, 0.5 단위) */
  hours: number | null
  bedTime: string | null
  wakeTime: string | null
}

export interface Condition {
  score: Level | null
  reason: string
}

export interface Workout {
  /** null = 아직 기록 안 함, false = 안 함, true = 함 */
  did: boolean | null
  /** 가슴/등/어깨/팔/코어/하체/유산소 등 다중 선택 */
  parts: string[]
  intensity: Intensity | null
  memo: string
}

export interface Diet {
  meals: Meal[]
  protein: Level | null
  water: Level | null
  /** 먹었나 안 먹었나만 본다. null = 아직 기록 안 함 */
  creatine: boolean | null
  sugar: Level | null
}

export type EventKind = 'appointment' | 'deadline' | 'task'

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  appointment: '약속',
  deadline: '마감',
  task: '할일',
}

export const EVENT_KIND_COLOR: Record<EventKind, string> = {
  appointment: '#8E6BB5',
  deadline: '#E4572E',
  task: '#3E8E7E',
}

/** 달력에 미리 등록해두는 일정. 지난 날에도, 앞으로의 날에도 붙는다. */
export interface DayEvent {
  id: string
  title: string
  kind: EventKind
  /** 'HH:MM'. 시간이 정해지지 않은 일정은 null */
  time: string | null
  /** 약속일 때 누구와 만나는지 (관계에 등록된 사람) */
  personIds: string[]
  done: boolean
  createdAt: number
  /** 목록에서의 자리. 할 일과 같은 눈금을 쓴다. */
  order: number
}

/** 하루를 어디에 썼는지 나누는 칸. 사용자가 직접 만든다. */
export interface TimeCategory {
  id: string
  label: string
  colorIndex: number
}

export const TIME_COLORS = [
  '#3D5AFE',
  '#E4572E',
  '#3E8E7E',
  '#E8B93B',
  '#8E6BB5',
  '#4F7CAC',
  '#C25A7B',
  '#7A9E3F',
  '#B8763E',
  '#5B6670',
]

/** 하루를 30분씩 48칸으로 나눈다. 0번 칸이 00:00~00:30. */
export const SLOT_COUNT = 48

export function slotLabel(index: number): string {
  const h = Math.floor(index / 2)
  const m = index % 2 === 0 ? '00' : '30'
  return `${String(h).padStart(2, '0')}:${m}`
}

export interface DayRecord {
  date: ISODate
  todos: Todo[]
  sleep: Sleep
  condition: Condition
  ideas: Idea[]
  workout: Workout
  weight: number | null
  diet: Diet
  interactions: Interaction[]
  reflection: string
  /** 하루를 매기는 최종 점수. 0~5, 0.5 단위. 달력 색의 기준이다. */
  score: number | null
  /** 그 점수에 대한 한 줄 평 */
  scoreNote: string
  /** 달력에 등록한 일정 */
  events: DayEvent[]
  /** 30분 단위 48칸. 각 칸에 시간 유형 id가 들어간다. 안 채운 칸은 null. */
  timeSlots: (string | null)[]
  updatedAt: number
}

export interface NotificationSettings {
  enabled: boolean
  /** 'HH:MM' 24시간제 */
  morningTime: string
  nightTime: string
  morningEnabled: boolean
  nightEnabled: boolean
  /** 슬롯별 마지막 발송 날짜 — 하루에 한 번만 울리도록 */
  lastFired: Record<string, ISODate>
}

export interface AppData {
  version: number
  days: Record<ISODate, DayRecord>
  people: Person[]
  notifications: NotificationSettings
  /** 사용자가 직접 추가한 운동 부위 */
  customWorkoutParts: string[]
  /** 사용자가 직접 만든 시간 유형 (연구실, 친구 모임, 휴식 …) */
  timeCategories: TimeCategory[]
  /**
   * 지운 사람의 묘비. 줄을 그냥 없애면 다른 기기가 되살려 놓기 때문에
   * '지웠다'는 사실 자체를 기록해서 같이 퍼뜨려야 한다.
   */
  deletedPeople: Record<string, number>
  /** 알림 시각·운동 부위 같은 설정의 최종 수정 시각 */
  settingsUpdatedAt: number
}

export const WORKOUT_PARTS = ['가슴', '등', '어깨', '팔', '코어', '하체', '유산소'] as const

export const MEAL_LABELS = ['아침', '점심', '저녁', '간식'] as const

export const INTENSITY_LABEL: Record<Intensity, string> = {
  low: '낮음',
  mid: '보통',
  high: '높음',
}

/** 사람 프로필에 돌아가며 배정되는 색. */
export const PERSON_COLORS = [
  '#E4572E',
  '#3D5AFE',
  '#3E8E7E',
  '#E8B93B',
  '#8E6BB5',
  '#C25A7B',
  '#4F7CAC',
  '#B8763E',
]

export function emptyDay(date: ISODate): DayRecord {
  return {
    date,
    todos: [],
    sleep: { hours: null, bedTime: null, wakeTime: null },
    condition: { score: null, reason: '' },
    ideas: [],
    workout: { did: null, parts: [], intensity: null, memo: '' },
    weight: null,
    diet: { meals: [], protein: null, water: null, creatine: null, sugar: null },
    interactions: [],
    reflection: '',
    score: null,
    scoreNote: '',
    events: [],
    timeSlots: Array.from({ length: SLOT_COUNT }, () => null),
    updatedAt: 0,
  }
}

export const DEFAULT_NOTIFICATIONS: NotificationSettings = {
  enabled: false,
  morningTime: '09:30',
  nightTime: '23:30',
  morningEnabled: true,
  nightEnabled: true,
  lastFired: {},
}
