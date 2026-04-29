// Lightweight Plotly wrapper — initializes once, redraws on prop changes.
import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'

interface Props {
  data: Plotly.Data[]
  layout: Partial<Plotly.Layout>
  config?: Partial<Plotly.Config>
  style?: React.CSSProperties
  // Fired when a bar is clicked. `customdata` is whatever string the trace
  // attached (we use it to identify matrix-group rows).
  onPointClick?: (customdata: string | null) => void
}

export function PlotlyChart({ data, layout, config, style, onPointClick }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  // Keep latest handler in a ref so we don't have to rebind the plotly listener
  // every render.
  const handlerRef = useRef<Props['onPointClick']>(onPointClick)
  handlerRef.current = onPointClick

  useEffect(() => {
    if (!ref.current) return
    Plotly.react(ref.current, data, layout, config ?? { displayModeBar: true, responsive: true })
  }, [data, layout, config])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    type PlotlyEl = HTMLDivElement & {
      on: (ev: string, cb: (e: { points?: Array<{ customdata?: unknown }> }) => void) => void
    }
    const onClick = (e: { points?: Array<{ customdata?: unknown }> }) => {
      const cd = e.points?.[0]?.customdata
      handlerRef.current?.(typeof cd === 'string' ? cd : null)
    }
    ;(el as PlotlyEl).on('plotly_click', onClick)
    return () => {
      Plotly.purge(el)
    }
  }, [])

  return <div ref={ref} style={style} />
}
