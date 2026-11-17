import { formatIndex } from '@/lib/utils'
import type { ForecastSnapshot } from '@/types/iot'

export function ForecastPanel({ forecast }: { forecast: ForecastSnapshot }) {
  return (
    <div className="space-y-4">
      <p className="text-sm leading-6 text-slate-300">
        {forecast.available
          ? `${forecast.selected_model} was closest on past one-minute checks, using ${forecast.training_bins ?? 0} readings from the last 24 hours. This window stays 24 hours even when the chart is shorter. “Same as last time” and the short average repeat one number across all six minutes.${forecast.stale ? ' The latest reading is old, so this starts from that reading.' : ''}`
          : forecast.note}
      </p>
      {forecast.available && forecast.points ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {forecast.points.map((point) => (
            <div key={point.minutes} className="forecast-card rounded border border-line bg-obsidian px-3 py-2" style={{ animationDelay: `${point.minutes * 40}ms` }}>
              <div className="font-mono text-[10px] text-slate-500">+{point.minutes} min</div>
              <div className="font-mono text-lg text-slate-100">{formatIndex(point.index)}</div>
            </div>
          ))}
        </div>
      ) : <p className="text-sm text-slate-400">More one-minute readings are needed before a forecast can be drawn.</p>}
      {forecast.metrics?.length ? (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {forecast.metrics.map((metric) => {
            const best = metric.model === forecast.selected_model
            return (
              <article key={metric.model} className={best ? 'rounded border border-emerald-500/50 p-3' : 'rounded border border-line p-3'}>
                <h3 className="text-sm">{metric.model}{best ? ' · closest check' : ''}</h3>
                <p className="mt-2 font-mono text-lg text-slate-100">{formatIndex(metric.mae, 4)}</p>
                <p className="font-mono text-[11px] text-slate-400">{metric.n} checks · RMSE {formatIndex(metric.rmse, 4)}</p>
              </article>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
