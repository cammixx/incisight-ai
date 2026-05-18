// Reaction status colors (OK / Irritated / Breakout)
export const reactionButtonColors: Record<string, string> = {
  OK: 'bg-green-400 text-white border-green-400',
  Irritated: 'bg-amber-400 text-white border-amber-400',
  Breakout: 'bg-red-400 text-white border-red-400',
}

export const reactionBadgeColors: Record<string, string> = {
  OK: 'bg-green-100 text-green-700',
  Irritated: 'bg-amber-100 text-amber-700',
  Breakout: 'bg-red-100 text-red-700',
}

// Notification type colors (expired / expiring / missing_dates)
export const notificationDotColors: Record<string, string> = {
  expired: 'bg-red-400',
  expiring: 'bg-amber-400',
  unopened: 'bg-amber-300',
  missing_dates: 'bg-rose-300',
}

export const notificationBorderColors: Record<string, string> = {
  expired: 'border-l-red-400',
  expiring: 'border-l-amber-400',
  unopened: 'border-l-amber-300',
  missing_dates: 'border-l-rose-300',
}
