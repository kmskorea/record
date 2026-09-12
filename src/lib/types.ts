/** 앱 전체에서 쓰는 데이터 모델. 날짜 키는 항상 'YYYY-MM-DD' (로컬 기준). */

export type ISODate = string

/** 1~5 단계 척도. 에너지, 불안, 식사량, 영양 섭취 등에 공통으로 쓴다. */
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

/**
 * 반추의 한 조각. 세 단계로 자란다 — 지나가는 문장을 모아 단락으로,
 * 단락을 엮어 글로. 단계가 올라가도 재료가 된 아래 것은 그대로 남는다.
 * 다듬은 결과만 남기면 어디서 온 생각인지 되짚을 수 없다.
 */
export type ThoughtLevel = 'sentence' | 'paragraph' | 'essay'

export const THOUGHT_LEVELS: {
  id: ThoughtLevel
  label: string
  /** 한 단계 위. 글은 더 올라갈 곳이 없다 */
  up: ThoughtLevel | null
  /** 깊어질수록 진해진다 */
  color: string
  bodyLabel: string
  bodyPlaceholder: string
}[] = [
  {
    id: 'sentence',
    label: '문장',
    up: 'paragraph',
    color: '#93A8D4',
    bodyLabel: '문장',
    bodyPlaceholder: '떠오른 그대로',
  },
  {
    id: 'paragraph',
    label: '단락',
    up: 'essay',
    color: '#4F7CAC',
    bodyLabel: '다듬은 단락',
    bodyPlaceholder: '모아둔 문장들을 이어 하나의 생각으로',
  },
  {
    id: 'essay',
    label: '글',
    up: null,
    color: '#1B3FD8',
    bodyLabel: '글',
    bodyPlaceholder: '단락들을 엮어 하나의 글로',
  },
]

export const THOUGHT_LEVEL = Object.fromEntries(
  THOUGHT_LEVELS.map((l) => [l.id, l]),
) as Record<ThoughtLevel, (typeof THOUGHT_LEVELS)[number]>

export interface Thought {
  id: string
  level: ThoughtLevel
  /** 단락·글의 이름. 문장에는 없다 */
  title: string
  text: string
  /** 담겨 있는 상위 생각. 아직 안 묶였으면 null */
  parentId: string | null
  createdAt: number
  /** 기기 간 최신본 판정 기준 */
  updatedAt: number
}

export interface Person {
  id: string
  name: string
  /** 자유 입력. '대학교 친구', '가족', '직장 동료' 등 사용자가 알아서 적는다. */
  relation: string
  /** 프로필 색상 인덱스 (PROFILE_COLORS 참조) */
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

/**
 * 유형마다 다르게 받는 칸.
 * 책에는 쪽수와 구절이, 영화에는 별점이, 영상에는 링크가 필요하다.
 */
export type ContentField = 'pages' | 'quote' | 'rating' | 'url'

export const CONTENT_FIELD_LABEL: Record<ContentField, string> = {
  pages: '쪽수',
  quote: '구절',
  rating: '별점',
  url: '링크',
}

/**
 * 링크는 그날의 감상이 아니라 작품 자체에 붙는다. 같은 영상을 두 번 봐도
 * 주소는 하나다. 나머지 칸은 '그날 어땠나'라서 날짜별 기록에 붙는다.
 */
export const ITEM_FIELDS: ContentField[] = ['url']

export interface ContentKindDef {
  id: string
  label: string
  /** 기기 간 최신본 판정 기준 */
  updatedAt: number
  /** 제목 옆에 적는 것. 유형마다 부르는 이름이 다르다 */
  bylineLabel: string
  /** 소감 칸의 이름. 책은 '생각', 영상은 '영감'이 자연스럽다 */
  noteLabel: string
  notePlaceholder: string
  /** 새 항목을 만드는 버튼에 쓰는 말 ('새 책', '새 영화') */
  newLabel: string
  fields: ContentField[]
  colorIndex: number
}

export const CONTENT_COLORS = [
  '#A9713C',
  '#8E6BB5',
  '#E4572E',
  '#3E8E7E',
  '#3D5AFE',
  '#C25A7B',
  '#E8B93B',
  '#4F7CAC',
]

/** 처음부터 있는 유형. 사용자가 만든 유형은 AppData.customContentKinds에 쌓인다. */
export const BUILTIN_CONTENT_KINDS: ContentKindDef[] = [
  {
    id: 'book',
    label: '독서',
    bylineLabel: '지은이',
    noteLabel: '그에 대한 나의 생각',
    notePlaceholder: '왜 걸렸는지, 무엇이 떠올랐는지',
    newLabel: '새 책',
    fields: ['pages', 'quote'],
    colorIndex: 0,
    updatedAt: 0,
  },
  {
    id: 'movie',
    label: '영화',
    bylineLabel: '감독',
    noteLabel: '소감',
    notePlaceholder: '보고 나서 남은 것',
    newLabel: '새 영화',
    fields: ['rating'],
    colorIndex: 1,
    updatedAt: 0,
  },
  {
    id: 'video',
    label: '유튜브 영상',
    bylineLabel: '채널',
    noteLabel: '영감',
    notePlaceholder: '여기서 얻은 것, 해보고 싶어진 것',
    newLabel: '새 영상',
    fields: ['url'],
    colorIndex: 2,
    updatedAt: 0,
  },
]

/**
 * 보고 읽은 것 한 편. 사람과 같은 취급이다 — 날짜별 기록이 여기에 매달리고,
 * 검색에서 하나로 모아 볼 수 있어야 하므로 따로 객체를 둔다.
 */
export interface ContentItem {
  id: string
  /** ContentKindDef.id */
  kind: string
  title: string
  /** 지은이 / 감독 / 채널. 유형에 따라 뜻이 달라진다 */
  byline: string
  /** 영상 주소처럼 작품 자체에 붙는 링크 */
  url: string
  /** 프로필 색상 인덱스 (PROFILE_COLORS 참조) */
  colorIndex: number
  createdAt: number
  /** 기기 간 최신본 판정 기준 */
  updatedAt: number
}

/** 특정 날짜에 그 작품을 보고 읽은 기록. */
export interface ContentLog {
  id: string
  itemId: string
  /** 독서: 그날 읽은 쪽수 */
  pages: number | null
  /** 독서: 인상적인 구절 */
  quote: string
  /** 영화 등: 0.5~5 별점 */
  rating: number | null
  /** 공통: 생각 / 소감 / 영감 */
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

/**
 * 그날의 내면 상태. 저장된 이름(day.condition)은 컨디션 하나만 있던 시절
 * 그대로 둔다 — 이름을 바꾸자고 예전 기록을 건드릴 이유가 없다.
 */
export interface InnerState {
  /** 예전의 '컨디션'. 화면에서는 에너지(방전 ↔ 충만) */
  energy: Level | null
  /** 불안·스트레스. 1 평온 ~ 5 극도 */
  anxiety: Level | null
  /** 왜 그랬을까 */
  reason: string
}

export interface Running {
  /** 뛴 거리(km) */
  km: number | null
  /** 1km 평균 페이스를 초로. 5'30"/km면 330 */
  paceSec: number | null
}

export interface Workout {
  /** null = 아직 기록 안 함, false = 안 함, true = 함 */
  did: boolean | null
  /** 가슴/등/어깨/팔/코어/하체/러닝 등 다중 선택 */
  parts: string[]
  intensity: Intensity | null
  /** 부위에 '러닝'을 골랐을 때만 쓰는 칸 */
  running: Running
  memo: string
}

/** 마신 술 한 줄. 소주 1병, 맥주 2잔처럼 주종마다 따로 적는다. */
export interface Drink {
  id: string
  /** 소주/맥주/와인 … 직접 적은 것도 들어온다 */
  kind: string
  amount: number
  /** 잔 / 병 / 캔 */
  unit: string
}

export interface Diet {
  meals: Meal[]
  protein: Level | null
  water: Level | null
  /** 먹었나 안 먹었나만 본다. null = 아직 기록 안 함 */
  creatine: boolean | null
  sugar: Level | null
  /** 마셨나 안 마셨나. null = 아직 기록 안 함 */
  alcohol: boolean | null
  /** 마신 날에만 채운다 */
  drinks: Drink[]
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

/** 스크린 타임을 적는 앱. 여기에 한 줄 더하면 화면과 그래프에 같이 붙는다. */
export const SNS_APPS = [
  { id: 'instagram', label: '인스타그램', color: '#C25A7B' },
  { id: 'youtube', label: '유튜브', color: '#E4572E' },
] as const

export type SnsAppId = (typeof SNS_APPS)[number]['id']

/** 하루를 어디에 썼는지 나누는 칸. 사용자가 직접 만든다. */
export interface TimeCategory {
  id: string
  label: string
  colorIndex: number
  /** 기기 간 최신본 판정 기준 */
  updatedAt: number
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
  condition: InnerState
  ideas: Idea[]
  workout: Workout
  weight: number | null
  diet: Diet
  interactions: Interaction[]
  /** 그날 보고 읽은 기록. 아무것도 안 본 날이 더 많아서 대개 비어 있다. */
  contentLogs: ContentLog[]
  reflection: string
  /** 하루를 매기는 최종 점수. 0~5, 0.5 단위. 달력 색의 기준이다. */
  score: number | null
  /** 그 점수에 대한 한 줄 평 */
  scoreNote: string
  /** 달력에 등록한 일정 */
  events: DayEvent[]
  /** 30분 단위 48칸. 각 칸에 시간 유형 id가 들어간다. 안 채운 칸은 null. */
  timeSlots: (string | null)[]
  /** 앱별 스크린 타임(분). 안 적은 앱은 아예 없다. */
  screenTime: Record<string, number>
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
  content: ContentItem[]
  thoughts: Thought[]
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
  /** 지운 콘텐츠의 묘비. 사람과 같은 이유다. */
  deletedContent: Record<string, number>
  /**
   * 지운 시간 유형·콘텐츠 유형의 묘비.
   *
   * 이 목록들은 다른 기록이 id로 가리키는 것이라(시간표 칸이 유형 id를 담는다)
   * 한쪽 기기의 옛 목록이 다른 쪽을 덮으면 칠해둔 시간이 통째로 안 보이게 된다.
   * 그래서 설정 뭉치에 담아 통째로 덮어쓰지 않고, 사람·콘텐츠와 같은 줄 단위
   * 병합을 쓴다.
   */
  deletedTimeCategories: Record<string, number>
  deletedContentKinds: Record<string, number>
  deletedThoughts: Record<string, number>
  /** 사용자가 직접 만든 콘텐츠 유형 (팟캐스트, 전시 …) */
  customContentKinds: ContentKindDef[]
  /** 알림 시각·운동 부위 같은 설정의 최종 수정 시각 */
  settingsUpdatedAt: number
}

/** 부위 중에서 이것만 거리·페이스를 따로 받는다. */
export const RUNNING_PART = '러닝'

/** 예전 이름. 옛 기록의 '유산소'는 읽을 때 '러닝'으로 옮긴다. */
export const LEGACY_RUNNING_PART = '유산소'

export const WORKOUT_PARTS = ['가슴', '등', '어깨', '팔', '코어', '하체', RUNNING_PART] as const

/** 러닝 말고 다른 부위를 하나라도 골랐으면 근력 운동으로 본다. */
export function isStrength(parts: string[]): boolean {
  return parts.some((p) => p !== RUNNING_PART)
}

export function isRunning(parts: string[]): boolean {
  return parts.includes(RUNNING_PART)
}

export const MEAL_LABELS = ['아침', '점심', '저녁', '간식'] as const

export const DRINK_UNITS = ['잔', '병', '캔'] as const

/** 자주 마시는 주종과, 그 주종에서 자연스러운 단위. */
export const ALCOHOL_KINDS: { label: string; unit: string }[] = [
  { label: '소주', unit: '병' },
  { label: '맥주', unit: '잔' },
  { label: '와인', unit: '잔' },
  { label: '막걸리', unit: '병' },
  { label: '위스키', unit: '잔' },
  { label: '하이볼', unit: '잔' },
]

export const INTENSITY_LABEL: Record<Intensity, string> = {
  low: '낮음',
  mid: '보통',
  high: '높음',
}

/** 사람·책 프로필에 돌아가며 배정되는 색. */
export const PROFILE_COLORS = [
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
    condition: { energy: null, anxiety: null, reason: '' },
    ideas: [],
    workout: {
      did: null,
      parts: [],
      intensity: null,
      running: { km: null, paceSec: null },
      memo: '',
    },
    weight: null,
    diet: {
      meals: [],
      protein: null,
      water: null,
      creatine: null,
      sugar: null,
      alcohol: null,
      drinks: [],
    },
    interactions: [],
    contentLogs: [],
    reflection: '',
    score: null,
    scoreNote: '',
    events: [],
    timeSlots: Array.from({ length: SLOT_COUNT }, () => null),
    screenTime: {},
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
