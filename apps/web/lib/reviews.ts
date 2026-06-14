/**
 * Review presentation vocabulary (labels/emoji for the pulse, kudos chips, and final dimensions). Mirrors the
 * KEYS owned by the api's reviews/taxonomy.ts — keep keys in sync; this file is presentation only.
 */
export type Pulse = 'up' | 'neutral' | 'down'
export const PULSES: { value: Pulse; label: string; emoji: string }[] = [
  { value: 'up', label: 'Great', emoji: '👍' },
  { value: 'neutral', label: 'Okay', emoji: '😐' },
  { value: 'down', label: 'Rough', emoji: '👎' },
]
export const pulseMeta = (p: Pulse | null) => PULSES.find((x) => x.value === p) ?? null

export type KudosKey = 'clear_comms' | 'fast' | 'above_beyond' | 'solved_hard' | 'reliable' | 'great_quality' | 'easy' | 'proactive'
export const KUDOS: { key: KudosKey; label: string; emoji: string }[] = [
  { key: 'clear_comms', label: 'Clear communicator', emoji: '💬' },
  { key: 'fast', label: 'Fast', emoji: '⚡' },
  { key: 'above_beyond', label: 'Above & beyond', emoji: '🌟' },
  { key: 'solved_hard', label: 'Solved a hard problem', emoji: '🧩' },
  { key: 'reliable', label: 'Reliable', emoji: '✅' },
  { key: 'great_quality', label: 'Great quality', emoji: '💎' },
  { key: 'easy', label: 'Easy to work with', emoji: '🤝' },
  { key: 'proactive', label: 'Proactive', emoji: '🚀' },
]
const KUDOS_BY_KEY = new Map(KUDOS.map((k) => [k.key as string, k]))
export const kudosMeta = (key: string) => KUDOS_BY_KEY.get(key) ?? { key, label: key, emoji: '🏅' }

export type DimensionKey = 'communication' | 'quality' | 'timeliness' | 'collaboration'
export const DIMENSIONS: { key: DimensionKey; label: string }[] = [
  { key: 'communication', label: 'Communication' },
  { key: 'quality', label: 'Quality' },
  { key: 'timeliness', label: 'Timeliness' },
  { key: 'collaboration', label: 'Collaboration' },
]
export type Dimensions = Record<DimensionKey, number>
