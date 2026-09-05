import { uiDynamic } from '../i18n/uiDynamicMessages';
import { uiText } from '../i18n/uiMessages';
export interface StatisticsSeries {
  readonly label: string;
  readonly values: readonly number[];
}

export interface StatisticsGraph {
  readonly times: readonly number[];
  readonly axis: string;
  readonly maximum: number;
  readonly series: readonly StatisticsSeries[];
  readonly note: string;
  readonly stepped: boolean;
}

const DASHES = ['', '8 5', '2 5'];

export function statisticsGraphMarkup(graph: StatisticsGraph): string {
  const first = graph.times[0]!;
  const last = graph.times.at(-1)!;
  const x = (time: number) => first === last ? 284 : 44 + (time - first) / (last - first) * 480;
  const y = (value: number) => 188 - value / graph.maximum * 160;
  const lines = graph.series.map((series, index) => {
    const path = series.values.map((value, point) => {
      const px = x(graph.times[point]!).toFixed(2);
      const py = y(value).toFixed(2);
      if (point === 0) return `M${px},${py}`;
      return graph.stepped ? `H${px}V${py}` : `L${px},${py}`;
    }).join(' ');
    return `<g class="statistics-series statistics-series--${index}">
      <path d="${path}" fill="none" stroke="currentColor" stroke-width="3" stroke-dasharray="${DASHES[index]}"/>
      ${series.values.map((value, point) => `<circle cx="${x(graph.times[point]!)}" cy="${y(value)}" r="3" fill="currentColor"/>`).join('')}
    </g>`;
  }).join('');
  const legend = graph.series.map((series, index) => `<span class="statistics-series statistics-series--${index}">
    <svg viewBox="0 0 30 8" aria-hidden="true"><path d="M1 4H29" stroke="currentColor" stroke-width="3" stroke-dasharray="${DASHES[index]}"/></svg>${series.label}
  </span>`).join('');
  const ticks = first === last ? [first] : [first, (first + last) / 2, last];
  return `<figure class="statistics-graph">
    <figcaption class="ui-role-context" data-ui-text="overTime">${uiText('overTime')}</figcaption>
    <div class="statistics-graph__legend ui-role-context">${legend}</div>
    <svg class="statistics-graph__plot ui-role-numeral" viewBox="0 0 560 238" role="img" aria-label="${uiDynamic('graphDescription', graph.series.map(({ label }) => label).join(', '), graph.axis)}">
      <title>${graph.note}</title>
      ${[0, graph.maximum / 2, graph.maximum].map((value) => `<path class="statistics-graph__grid" d="M44 ${y(value)}H524"/><text x="34" y="${y(value) + 4}" text-anchor="end">${value}</text>`).join('')}
      ${lines}
      ${ticks.map((time) => `<text x="${x(time)}" y="210" text-anchor="middle">${Number(time.toFixed(1))}</text>`).join('')}
      <text x="284" y="232" text-anchor="middle">${graph.axis}</text>
    </svg>
    <p class="statistics-graph__note ui-role-narrative">${graph.note}</p>
    <details class="statistics-graph__data ui-role-context">
      <summary data-ui-text="viewGraph">${uiText('viewGraph')}</summary>
      <div class="statistics-graph__table"><table>
        <caption data-ui-text="recordedValues">${uiText('recordedValues')}</caption>
        <thead><tr><th scope="col">${graph.axis}</th>${graph.series.map(({ label }) => `<th scope="col">${label}</th>`).join('')}</tr></thead>
        <tbody>${graph.times.map((time, point) => `<tr><th scope="row">${Number(time.toFixed(1))}</th>${graph.series.map(({ values }) => `<td>${values[point]}</td>`).join('')}</tr>`).join('')}</tbody>
      </table></div>
    </details>
  </figure>`;
}
