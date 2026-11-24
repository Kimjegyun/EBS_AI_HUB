import type { ReactNode } from 'react'

export type VoiceSummary = { title: string; overview: string; keyPoints: string[]; actionItems: string[] }

export function VoiceSummaryResult({ summary, children }: { summary: VoiceSummary; children: ReactNode }) {
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col">
    <div className="voice-summary-content min-h-0 min-w-0 space-y-3 overflow-x-hidden overflow-y-auto" aria-label="요약 결과">
      <h4 className="whitespace-pre-wrap font-h3 text-h3">{summary.title}</h4>
      <p className="whitespace-pre-wrap">{summary.overview}</p>
      {!!summary.keyPoints.length && <section>
        <h5 className="mb-2 font-semibold">핵심 내용</h5>
        <ul className="space-y-2 pl-5">{summary.keyPoints.map((item, i) => <li className="list-disc whitespace-pre-wrap" key={i}>{item}</li>)}</ul>
      </section>}
      {!!summary.actionItems.length && <section>
        <h5 className="mb-2 font-semibold">후속 조치</h5>
        <ul className="space-y-2 pl-5">{summary.actionItems.map((item, i) => <li className="list-disc whitespace-pre-wrap" key={i}>{item}</li>)}</ul>
      </section>}
    </div>
    <div className="mt-3 shrink-0 border-t pt-3">{children}</div>
  </div>
}
