// Two helpers every control uses, kept out of `ui.tsx` so that file exports
// components and nothing else — a module mixing the two loses fast refresh.

export const cx = (...parts: (string | false | undefined | null)[]) => parts.filter(Boolean).join(' ')

export const dwellVar = (ms: number) => ({ '--dwell-duration': `${ms}ms` }) as React.CSSProperties
