import type React from 'react'
import { useEffect, useRef } from 'react'

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger' | 'info'

const toneClass: Record<Tone, string> = {
  neutral: 'border-gray-200 bg-slate-100 text-gray-600',
  accent: 'border-violet/30 bg-violet/10 text-accent',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  danger: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-sky-200 bg-sky-50 text-sky-700',
}

export function Pill({
  children,
  className = '',
  tone = 'neutral',
}: {
  children: React.ReactNode
  className?: string
  tone?: Tone
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-4 ${toneClass[tone]} ${className}`}
    >
      {children}
    </span>
  )
}

export function Banner({
  children,
  tone,
}: {
  children: React.ReactNode
  tone: 'success' | 'danger'
}) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm leading-6 ${toneClass[tone]} ${
        tone === 'success' ? 'font-semibold' : ''
      }`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      {children}
    </div>
  )
}

export function IconButton({
  badge = 0,
  children,
  label,
  onClick,
  size = 'md',
}: {
  badge?: number
  children: React.ReactNode
  label: string
  onClick?: () => void
  size?: 'md' | 'lg'
}) {
  return (
    <button
      aria-label={badge > 0 ? `${label} (${badge})` : label}
      className={`relative grid shrink-0 place-items-center rounded-lg border border-gray-300 bg-surface text-ink hover:bg-gray-50 ${
        size === 'lg' ? 'h-11 w-11' : 'h-10 w-10'
      }`}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
      {badge > 0 ? (
        <span className="absolute -right-1.5 -top-1.5 min-w-[18px] rounded-full bg-violet px-1 text-center text-[11px] font-bold leading-[18px] tabular-nums text-white">
          {badge}
        </span>
      ) : null}
    </button>
  )
}

/**
 * Shared behaviour for modal surfaces: Escape closes, and focus returns to whatever
 * opened the dialog once it unmounts.
 */
export function useDialog(onClose: () => void, active = true) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!active) return undefined
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onCloseRef.current()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      opener?.focus?.()
    }
  }, [active])
}

export function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}
