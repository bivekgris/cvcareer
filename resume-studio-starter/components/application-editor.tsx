'use client';

import { Check, Download, Sparkles } from 'lucide-react';
import type { Application } from '../lib/application';
import type { Resume } from '../lib/types';

type Props = {
  resume: Resume;
  proposal: Application;
  sample: boolean;
  applied: boolean;
  stale: boolean;
  onApply: () => void;
  onDiscard: () => void;
  onCoverChange: (value: string) => void;
  onPrintCover: () => void;
};

export default function ApplicationEditor({ resume, proposal, sample, applied, stale, onApply, onDiscard, onCoverChange, onPrintCover }: Props) {
  return <>
    <section className="suggestion" aria-label="Resume suggestions">
      <div className="suggestion-heading"><Sparkles size={17} /> {sample ? 'Sample resume suggestions' : 'Tailored resume suggestions'}</div>
      <p className="hint">{stale ? 'Your resume or job description changed. Generate a fresh draft to apply suggestions.' : 'Review each change for accuracy before exporting your resume.'}</p>
      <details open><summary>Professional summary</summary><p>{proposal.summary}</p></details>
      <details open><summary>Skills</summary><p>{proposal.skills || 'No skills listed.'}</p></details>
      {proposal.experience.map(entry => <details key={entry.id} open>
        <summary>{resume.experiences.find(job => job.id === entry.id)?.role || 'Experience'}</summary>
        <ul className="changed-bullets">
          {entry.bullets.split('\n').filter(bullet => bullet.trim()).map((bullet, index) =>
            <li key={index}>{bullet.replace(/^[•*-]\s*/, '')}</li>)}
        </ul>
      </details>)}
      {proposal.matchedKeywords.length > 0 && <div>
        <p className="keyword-label">Matched keywords</p>
        <ul className="keyword-list">{proposal.matchedKeywords.map((word, index) => <li key={index}>{word}</li>)}</ul>
      </div>}
      <div className="suggestion-actions">
        <button className="btn primary" onClick={onApply} disabled={applied || stale}><Check size={16} />{applied ? 'Applied' : 'Apply to resume'}</button>
        <button className="btn light" onClick={onDiscard}>{applied ? 'Close draft' : 'Discard draft'}</button>
      </div>
    </section>
    <section className="suggestion" aria-label="Cover letter draft">
      <label className="field"><span className="suggestion-heading">Cover letter draft</span>
        <textarea rows={12} value={proposal.coverLetter} onChange={event => onCoverChange(event.target.value)} /></label>
      <div className="suggestion-actions">
        <button className="btn primary" disabled={!proposal.coverLetter.trim()} onClick={onPrintCover}><Download size={16} /> Export cover letter PDF</button>
      </div>
    </section>
  </>;
}
