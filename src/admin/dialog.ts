export function modalKeyAction({ key, shiftKey, atFirst, atLast }: { key: string; shiftKey: boolean; atFirst: boolean; atLast: boolean }) {
  if (key === 'Escape') return 'close' as const
  if (key !== 'Tab') return null
  if (shiftKey && atFirst) return 'last' as const
  if (!shiftKey && atLast) return 'first' as const
  return null
}
