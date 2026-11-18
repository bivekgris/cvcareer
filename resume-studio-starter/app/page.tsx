'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ArrowRight, Check, CircleCheck, CloudDownload, Download, FileCheck2, FileText, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import AccountPanel from '../components/account-panel';
import ApplicationEditor from '../components/application-editor';
import { applyApplication, isApplication, sampleApplication, type Application } from '../lib/application';
import { createWorkspaceClient } from '../lib/supabase';
import { emptyResume, readDraft, seedResume, templates, type Draft, type Experience, type Resume, type Template } from '../lib/types';

type Screen = 'home' | 'builder' | 'pricing' | 'account';
type Tab = 'details' | 'experience' | 'design' | 'ai';
type Review = { application: Application; source: string; job: string; sample: boolean; applied: boolean };
type CheckoutPlan = 'pack' | 'pro' | 'manage';
const storageKey = 'hiredly-demo-resume-v1';
const pagesDemo = process.env.NEXT_PUBLIC_PAGES_DEMO === '1';
const tabs: { key: Tab; label: string }[] = [
  { key: 'details', label: 'Details' }, { key: 'experience', label: 'Experience' },
  { key: 'design', label: 'Design' }, { key: 'ai', label: pagesDemo ? 'Sample application' : 'AI application' },
];

function ResumePaper({ resume, template }: Draft) {
  return <article className={'resume-paper resume-' + template}>
    <header className="resume-top">
      <div className="resume-name">{resume.name || 'Your name'}</div>
      {resume.headline && <div className="resume-role">{resume.headline}</div>}
      <div className="resume-contacts">{[resume.location, resume.phone, resume.email].filter(Boolean).join('  •  ')}</div>
    </header>
    {resume.summary.trim() && <section><h3>Professional Summary</h3><p>{resume.summary}</p></section>}
    {resume.experiences.length > 0 && <section><h3>Professional Experience</h3>
      {resume.experiences.map(entry => <div className="resume-job" key={entry.id}>
        <div className="resume-job-heading"><strong>{entry.role || 'Job title'}</strong><span>{entry.dates}</span></div>
        {entry.company && <div className="resume-company">{entry.company}</div>}
        {entry.bullets.trim() && <ul>{entry.bullets.split('\n').filter(bullet => bullet.trim()).map((bullet, index) =>
          <li key={index}>{bullet.replace(/^[•*-]\s*/, '')}</li>)}</ul>}
      </div>)}
    </section>}
    {resume.skills.trim() && <section><h3>Core Skills</h3><p>{resume.skills}</p></section>}
    {resume.education.trim() && <section><h3>Education</h3><p>{resume.education}</p></section>}
  </article>;
}

type FieldProps = { label: string; value: string; onChange: (value: string) => void; rows?: number; placeholder?: string; maxLength?: number };

function Field({ label, value, onChange, rows, placeholder, maxLength }: FieldProps) {
  return <label className="field"><span>{label}</span>
    {rows ? <textarea rows={rows} value={value} placeholder={placeholder} maxLength={maxLength} onChange={event => onChange(event.target.value)} />
      : <input value={value} placeholder={placeholder} maxLength={maxLength} onChange={event => onChange(event.target.value)} />}
  </label>;
}

const paidPlans = [
  { id: 'pack', name: 'AI Application Pack', price: 'A$2.99', period: 'per pack', features: ['One tailored resume', 'One matching cover letter', 'Matched keywords', 'Resume and cover letter PDFs'] },
  { id: 'pro', name: 'Pro Monthly', price: 'A$12.99', period: 'per month', features: ['15 tailored resumes per billing month', '15 matching cover letters', 'Multiple online resume versions', 'Unlimited PDF exports'] },
] as const;

export default function Page() {
  const [screen, setScreen] = useState<Screen>('home');
  const [tab, setTab] = useState<Tab>('details');
  const [resume, setResume] = useState<Resume>(emptyResume);
  const [template, setTemplate] = useState<Template>('classic');
  const [job, setJob] = useState('');
  const [review, setReview] = useState<Review | null>(null);
  const [pending, setPending] = useState(false);
  const [buying, setBuying] = useState(false);
  const [notice, notify] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState(false);
  const [client] = useState(() => pagesDemo || typeof window === 'undefined' ? null : createWorkspaceClient());
  const [session, setSession] = useState<Session | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [credits, setCredits] = useState<number | null>(null);
  const [printTarget, setPrintTarget] = useState<'resume' | 'cover'>('resume');
  const fileRef = useRef<HTMLInputElement>(null);
  const workspaceRevision = useRef(0);

  const draft = { resume, template };

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      const local = readDraft(stored);
      if (local) {
        setResume(local.resume);
        setTemplate(local.template);
        if (typeof stored.job === 'string') setJob(stored.job);
        const result = stored.review;
        if (isApplication(result?.application) && typeof result.source === 'string' && typeof result.job === 'string' &&
            typeof result.sample === 'boolean' && typeof result.applied === 'boolean') setReview(result);
      }
    } catch {
      notify('The browser draft could not be restored.');
    }
    setLoaded(true);

    function readLocation() {
      const query = new URLSearchParams(location.search);
      const view = query.get('view');
      if (view === 'builder' || (!pagesDemo && (view === 'pricing' || view === 'account'))) setScreen(view);
      else setScreen('home');
      if (pagesDemo) return;
      if (query.get('checkout') === 'success') {
        navigate('account', true);
        notify('Checkout complete. Credits appear here after Stripe confirms payment.');
      } else if (query.get('checkout') === 'cancelled') {
        navigate('pricing', true);
        notify('Checkout was cancelled.');
      }
    }
    readLocation();
    window.addEventListener('popstate', readLocation);
    return () => window.removeEventListener('popstate', readLocation);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify({ resume, template, job, review }));
      setSaved(true);
    } catch { setSaved(false); }
  }, [loaded, resume, template, job, review]);

  useEffect(() => {
    if (!client) return;
    const { data } = client.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') {
        setRecovering(true);
        navigate('account', true);
      }
    });
    return () => data.subscription.unsubscribe();
  }, [client]);

  const refreshCredits = useCallback(async (signal?: AbortSignal) => {
    const token = session?.access_token;
    if (!token) { setCredits(null); return; }
    try {
      const response = await fetch('/api/credits', { headers: { Authorization: 'Bearer ' + token }, signal });
      if (!response.ok) throw new Error();
      const balance = await response.json();
      setCredits(balance.credits);
    } catch { if (!signal?.aborted) setCredits(null); }
  }, [session?.access_token]);

  useEffect(() => {
    const controller = new AbortController();
    void refreshCredits(controller.signal);
    return () => controller.abort();
  }, [refreshCredits]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => notify(''), 7000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const resetPrintTarget = () => setPrintTarget('resume');
    window.addEventListener('afterprint', resetPrintTarget);
    return () => window.removeEventListener('afterprint', resetPrintTarget);
  }, []);

  function navigate(next: Screen, replace = false) {
    const url = new URL(window.location.href);
    url.searchParams.delete('checkout');
    if (next === 'home') url.searchParams.delete('view');
    else url.searchParams.set('view', next);
    if (url.href !== window.location.href) {
      if (replace) window.history.replaceState(null, '', url);
      else window.history.pushState(null, '', url);
    }
    setScreen(next);
    window.scrollTo(0, 0);
  }

  function openBuilder(nextTab?: Tab) {
    if (nextTab) setTab(nextTab);
    navigate('builder');
  }

  function replaceDraft(next: Draft) {
    workspaceRevision.current += 1;
    setResume(next.resume);
    setTemplate(next.template);
    setReview(null);
    openBuilder('details');
  }

  function startOver(next: Resume) {
    const hasDraft = Object.values(resume).some(value => Array.isArray(value) ? value.length > 0 : value.trim());
    if ((hasDraft || job.trim() || review) && !window.confirm('Replace the resume and application draft in this browser?')) return;
    setJob('');
    replaceDraft({ resume: next, template });
  }

  function editField(key: Exclude<keyof Resume, 'experiences'>, value: string) {
    setResume(current => ({ ...current, [key]: value }));
  }

  function editExperience(id: string, field: Exclude<keyof Experience, 'id'>, value: string) {
    setResume(current => ({
      ...current,
      experiences: current.experiences.map(entry => entry.id === id ? { ...entry, [field]: value } : entry),
    }));
  }

  function print(target: 'resume' | 'cover') {
    setPrintTarget(target);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()));
  }

  function exportJson() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'my-resume-data.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function importJson(file?: File) {
    if (!file) return;
    try {
      const imported = readDraft(JSON.parse(await file.text()));
      if (!imported) throw new Error();
      if (!window.confirm('Replace your current browser draft with this backup?')) return;
      replaceDraft(imported);
      notify('Resume backup imported.');
    } catch { notify('Choose a valid JSON backup exported from the resume builder.'); }
  }

  async function generate(sample: boolean) {
    if (!resume.name.trim() || !job.trim()) { notify('Enter your name and a job description first.'); return; }
    if (!sample && !session) { navigate('account'); notify('Sign in to generate an AI application.'); return; }
    if (review && !window.confirm('Replace the current suggestions and cover letter?')) return;
    setPending(true);
    const source = JSON.stringify(resume);
    const revision = workspaceRevision.current;
    try {
      let application: Application;
      if (sample) application = sampleApplication(resume, job);
      else {
        const response = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session?.access_token },
          body: JSON.stringify({ resume, job }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error);
        if (!isApplication(result.application)) throw new Error('The application could not be read.');
        application = result.application;
      }
      if (workspaceRevision.current !== revision) return;
      setReview({ application, source, job, sample, applied: false });
      notify('Application draft ready for review.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Application generation failed.');
    } finally {
      setPending(false);
      if (!sample) void refreshCredits();
    }
  }

  async function checkout(plan: CheckoutPlan) {
    if (!session) {
      navigate('account');
      notify('Sign in, then return to Pricing to choose a plan.');
      return;
    }
    setBuying(true);
    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ plan }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      window.location.assign(result.url);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Checkout is unavailable.');
      setBuying(false);
    }
  }

  const staleReview = Boolean(review && (review.job !== job || (!review.applied && review.source !== JSON.stringify(resume))));

  return <>
    <header className="site-header">
      <div className="shell nav">
        <button className="logo" onClick={() => navigate('home')} aria-label="CVCareer home">
          <span className="logo-icon"><FileCheck2 size={19} /></span>
          <span>CVCareer</span>
        </button>
        <nav aria-label="Main navigation">
          <button onClick={() => openBuilder('design')}>Templates</button>
          {!pagesDemo && <>
            <button onClick={() => navigate('pricing')} aria-current={screen === 'pricing' ? 'page' : undefined}>Pricing</button>
            <button onClick={() => navigate('account')} aria-current={screen === 'account' ? 'page' : undefined}>Account</button>
          </>}
        </nav>
        <button className="nav-action" onClick={() => openBuilder()}>Open builder <ArrowRight size={16} /></button>
      </div>
    </header>

    {screen === 'home' && <main>
      <section className="hero shell">
        <div className="hero-copy">
          <h1>Build a resume for <em>your next job.</em></h1>
          <p>{pagesDemo ? 'Try the resume editor, preview three templates and create a sample application draft. Your edits stay in this browser.' : 'Create and download your resume for free. For a specific role, get a tailored resume and cover letter in Australian English.'}</p>
          <div className="hero-actions">
            <button className="btn primary big" onClick={() => openBuilder('details')}>Build my free resume <ArrowRight size={18} /></button>
            <button className="btn light big" onClick={() => pagesDemo ? openBuilder('ai') : navigate('pricing')}>{pagesDemo ? 'Explore the sample workflow' : 'See pricing'}</button>
          </div>
          <div className="hero-trust"><span><Check size={15} /> Free PDF exports</span><span><Check size={15} /> No account needed for the builder</span></div>
        </div>
        <div className="hero-showcase" aria-label="Example resume">
          <div className="hero-doc"><ResumePaper resume={seedResume} template="classic" /></div>
        </div>
      </section>
      <section className="feature-band">
        <div className="shell feature-grid">
          <div><span className="round-icon"><FileText /></span><h2>Write your resume</h2><p>Add your experience, skills and education, then choose from three templates.</p></div>
          <div><span className="round-icon"><Sparkles /></span><h2>Tailor it to a role</h2><p>Paste a job ad to get relevant suggestions based on your experience.</p></div>
          <div><span className="round-icon"><Download /></span><h2>Review and export</h2><p>Check the suggested changes and download your resume and cover letter as PDFs.</p></div>
        </div>
      </section>
    </main>}

    {!pagesDemo && screen === 'pricing' && <main className="shell pricing-page">
      <div className="center-intro"><h1>Plans for your job search</h1><p>Resume editing and PDF exports are free.</p></div>
      <div className="price-grid">
        <div className="price-card">
          <h2>Free Builder</h2>
          <div className="price">A$0</div>
          <ul>{['Resume editor and live preview', 'Three templates', 'Free resume PDF export', 'Browser autosave'].map(feature => <li key={feature}><Check />{feature}</li>)}</ul>
          <button className="btn light full" onClick={() => openBuilder('details')}>Create a resume</button>
        </div>
        {paidPlans.map(plan => <div className={'price-card' + (plan.id === 'pack' ? ' featured' : '')} key={plan.id}>
          <h2>{plan.name}</h2>
          <div className="price">{plan.price} <small>{plan.period}</small></div>
          <ul>{plan.features.map(feature => <li key={feature}><Check />{feature}</li>)}</ul>
          <button className={'btn full ' + (plan.id === 'pack' ? 'primary' : 'dark')} disabled={buying}
            onClick={() => void checkout(plan.id)}>{plan.id === 'pack' ? 'Choose application pack' : 'Choose Pro'} <ArrowRight size={16} /></button>
        </div>)}
      </div>
      <p className="pricing-disclaimer">Checkout is in test mode. Each application credit covers one tailored resume and one matching cover letter.</p>
    </main>}

    {!pagesDemo && screen === 'account' && <AccountPanel key={session?.user.id ?? 'guest'} client={client} session={session} draft={draft}
      onLoad={replaceDraft} onManage={() => void checkout('manage')} credits={credits} onRefreshCredits={() => void refreshCredits()}
      recovering={recovering} onRecovered={() => setRecovering(false)} />}

    {screen === 'builder' && <main className="builder-layout" data-print={printTarget}>
      <aside className="editor-panel">
        <div className="editor-heading">
          <h1>Resume workspace</h1>
          <span className="saved-status" role="status">{loaded && (saved ? 'Saved in this browser' : 'Browser save unavailable')}</span>
        </div>
        <div className="editor-tabs" role="group" aria-label="Editor section">
          {tabs.map(item => <button key={item.key} className={tab === item.key ? 'active' : ''} aria-pressed={tab === item.key}
            onClick={() => setTab(item.key)}>{item.label}</button>)}
        </div>
        <div className="editor-scroll">
          {tab === 'details' && <div className="fields-stack">
            <div className="suggestion-actions">
              <button className="btn light" disabled={pending} onClick={() => startOver(seedResume)}>Load sample resume</button>
              <button className="btn light" disabled={pending} onClick={() => startOver(emptyResume)}>Start a blank resume</button>
            </div>
            <h2>Personal information</h2>
            <Field label="Full name" value={resume.name} onChange={value => editField('name', value)} placeholder="Alex Morgan" />
            <Field label="Professional headline" value={resume.headline} onChange={value => editField('headline', value)} placeholder="IT Support Specialist" />
            <div className="two-fields">
              <Field label="Email" value={resume.email} onChange={value => editField('email', value)} />
              <Field label="Phone" value={resume.phone} onChange={value => editField('phone', value)} />
            </div>
            <Field label="Location" value={resume.location} onChange={value => editField('location', value)} />
            <Field label="Professional summary" value={resume.summary} onChange={value => editField('summary', value)} rows={5} />
            <Field label="Skills (comma-separated)" value={resume.skills} onChange={value => editField('skills', value)} rows={3} />
            <Field label="Education" value={resume.education} onChange={value => editField('education', value)} rows={3} />
          </div>}
          {tab === 'experience' && <div className="fields-stack">
            <h2>Work experience</h2><p className="hint">Use one bullet per line.</p>
            {resume.experiences.map((entry, index) => <div className="experience-card" key={entry.id}>
              <div className="exp-top"><strong>Position {index + 1}</strong>
                <button aria-label={'Remove position ' + (index + 1)} onClick={() => setResume(current => ({
                  ...current, experiences: current.experiences.filter(item => item.id !== entry.id),
                }))}><Trash2 size={16} /></button>
              </div>
              <Field label="Job title" value={entry.role} onChange={value => editExperience(entry.id, 'role', value)} />
              <Field label="Company" value={entry.company} onChange={value => editExperience(entry.id, 'company', value)} />
              <Field label="Dates" value={entry.dates} onChange={value => editExperience(entry.id, 'dates', value)} />
              <Field label="Responsibilities and achievements" value={entry.bullets} onChange={value => editExperience(entry.id, 'bullets', value)} rows={5} />
            </div>)}
            <button className="btn light full" onClick={() => setResume(current => ({
              ...current, experiences: [...current.experiences, { id: crypto.randomUUID(), role: '', company: '', dates: '', bullets: '' }],
            }))}><Plus size={16} /> Add experience</button>
          </div>}
          {tab === 'design' && <div className="fields-stack">
            <h2>Choose your template</h2>
            <div className="template-grid">
              {templates.map(item => <button key={item} aria-pressed={template === item}
                className={'template-option' + (template === item ? ' chosen' : '')} onClick={() => setTemplate(item)}>
                <div className={'template-thumbnail thumb-' + item} aria-hidden="true"><i /><b /><span /><span /><span /></div>
                <strong>{item[0].toUpperCase() + item.slice(1)}</strong>
                {template === item && <CircleCheck size={17} />}
              </button>)}
            </div>
            <button className="btn light full" onClick={exportJson}><CloudDownload size={16} /> Download JSON backup</button>
            <button className="btn light full" disabled={pending} onClick={() => fileRef.current?.click()}><Upload size={16} /> Import JSON backup</button>
            <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              void importJson(file);
            }} />
          </div>}
          {tab === 'ai' && <div className="fields-stack">
            <h2>Tailor an application</h2>
            <p className="hint">Generate suggestions for your summary, skills and experience alongside a cover letter for the same role.</p>
            <Field label="Job description" value={job} onChange={setJob} rows={8} maxLength={12_000} placeholder="Paste the job ad here" />
            {credits !== null && <p className="hint">Application credits remaining · {credits}</p>}
            <div className="ai-actions">
              {!pagesDemo && <button className="btn primary" disabled={pending || !job.trim() || !resume.name.trim()}
                onClick={() => void generate(false)}><Sparkles size={15} /> Generate AI application</button>}
              <button className="btn light" disabled={pending || !job.trim() || !resume.name.trim()}
                onClick={() => void generate(true)}>Try a sample draft</button>
            </div>
            <p className="hint">{pagesDemo ? 'The sample matches existing skills to the job ad and drafts a cover letter in this browser.' : 'AI generation uses one application credit. The sample uses your existing resume text and runs in this browser.'}</p>
            {pending && <p role="status" className="hint">Preparing your application…</p>}
            {review && <ApplicationEditor resume={resume} proposal={review.application} sample={review.sample} stale={staleReview} applied={review.applied}
              onApply={() => {
                if (staleReview || review.applied) return;
                setResume(applyApplication(resume, review.application));
                setReview({ ...review, applied: true });
                notify('Suggestions applied. Your resume preview is up to date.');
              }}
              onDiscard={() => { if (window.confirm('Remove these suggestions and the cover letter draft?')) setReview(null); }}
              onCoverChange={coverLetter => setReview({ ...review, application: { ...review.application, coverLetter } })}
              onPrintCover={() => print('cover')} />}
          </div>}
        </div>
      </aside>
      <div className="preview-panel">
        <div className="preview-top">
          <h2>Resume preview</h2>
          <div className="preview-actions">
            {!pagesDemo && <button className="btn light" onClick={() => navigate('account')}>Online versions</button>}
            <button className="btn primary" disabled={!resume.name.trim()} onClick={() => print('resume')}><Download size={16} /> Export PDF</button>
          </div>
        </div>
        <div className="preview-canvas"><ResumePaper {...draft} /></div>
        <p className="preview-hint">Choose “Save as PDF” in your browser’s print dialog.</p>
      </div>
      {review && <article className="cover-print"><h1>{resume.name}</h1><div>{review.application.coverLetter}</div></article>}
    </main>}
    {notice && <div role="status" className="toast"><span>{notice}</span><button onClick={() => notify('')} aria-label="Dismiss message"><X size={16} /></button></div>}
    {screen !== 'builder' && <footer className="footer"><div className="shell">© {new Date().getFullYear()} CVCareer</div></footer>}
  </>;
}
