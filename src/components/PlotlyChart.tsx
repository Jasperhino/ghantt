// Lightweight Plotly wrapper — initializes once, redraws on prop changes.
import { useEffect, useRef } from 'react'
import Plotly from 'plotly.js-dist-min'

interface Props {
  data: Plotly.Data[]
  layout: Partial<Plotly.Layout>
  config?: Partial<Plotly.Config>
  style?: React.CSSProperties
}

export function PlotlyChart({ data, layout, config, style }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!ref.current) return
    Plotly.react(ref.current, data, layout, config ?? { displayModeBar: true, responsive: true })
  }, [data, layout, config])

  useEffect(() => {
    const el = ref.current
    return () => {
      if (el) Plotly.purge(el)
    }
  }, [])

  return <div ref={ref} style={style} />
}
