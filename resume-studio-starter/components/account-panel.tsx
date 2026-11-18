'use client';

import { useEffect, useState, type FormEvent } from 'react';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { readDraft, type Draft } from '../lib/types';

type SavedVersion = { title: string; draft: unknown; updated_at: string };

type AccountPanelProps = {
  client: SupabaseClient | null;
  session: Session | null;
  draft: Draft;
  onLoad: (draft: Draft) => void;
  onManage: () => void;
  credits: number | null;
  onRefreshCredits: () => void;
  recovering: boolean;
  onRecovered: () => void;
};

export default function AccountPanel({ client, session, draft, onLoad, onManage, credits, onRefreshCredits, recovering, onRecovered }: AccountPanelProps) {
  const [formMode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const mode = recovering ? 'password' : formMode;
  const [versions, setVersions] = useState<SavedVersion[]>([]);
  const [title, setTitle] = useState('');
  const [savedTitle, setSavedTitle] = useState('');
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const userId = session?.user.id;

  useEffect(() => {
    if (!client || !userId) return;
    let current = true;
    client.from('resume_versions').select('title, draft, updated_at').eq('user_id', userId)
      .order('updated_at', { ascending: false }).then(({ data, error }) => {
        if (!current) return;
        if (error) setMessage('Saved versions could not be loaded.');
        else setVersions(data);
      });
    return () => { current = false; };
  }, [client, userId]);

  async function submitAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const redirectTo = new URL('/?view=account', window.location.origin).href;
    setPending(true);
    setMessage('');
    try {
      if (mode === 'signup') {
        const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        if (!data.session) setMessage('Check your email to confirm your account.');
      } else if (mode === 'reset') {
        const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo });
        if (error) throw error;
        setMessage('If an account exists for that email, you’ll receive a reset link.');
      } else if (mode === 'password') {
        const { error } = await client.auth.updateUser({ password });
        if (error) throw error;
        setMode('signin');
        onRecovered();
        setMessage('Password changed.');
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'The account request could not be completed.');
    } finally {
      setPending(false);
    }
  }

  async function storeVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || !userId || !title.trim()) return;
    const label = title.trim();
    if (label !== savedTitle && versions.some(version => version.title === label)) {
      setMessage('Select that version and use Save changes, or choose a new title.');
      return;
    }
    setPending(true);
    const version = { title: label, draft, updated_at: new Date().toISOString() };
    const table = client.from('resume_versions');
    const { error } = label === savedTitle
      ? await table.update(version).eq('user_id', userId).eq('title', label).select('title').single()
      : await table.insert({ ...version, user_id: userId });
    setPending(false);
    if (error) {
      setMessage('Could not save this version. Check the title and try again.');
      return;
    }
    setVersions(current => [version, ...current.filter(entry => entry.title !== label)]);
    setSavedTitle(label);
    setMessage('Resume version saved.');
  }

  async function deleteVersion() {
    if (!client || !userId || !savedTitle || !window.confirm('Delete the online version “' + savedTitle + '”?')) return;
    setPending(true);
    const { error } = await client.from('resume_versions').delete().eq('user_id', userId).eq('title', savedTitle);
    setPending(false);
    if (error) { setMessage('Could not delete this version.'); return; }
    setVersions(current => current.filter(entry => entry.title !== savedTitle));
    setSavedTitle('');
    setTitle('');
    setMessage('Online version deleted.');
  }

  return <main className="shell account-page">
    <h1>Your account</h1>
    {!client ? <p>Online accounts are being set up. You can use the free builder and save your resume in this browser.</p>
      : session && mode !== 'password' ? <div className="account-grid">
        <section className="account-card fields-stack">
          <h2>Profile and billing</h2>
          <p>{session.user.email}</p>
          <p>{credits === null ? 'Application credit balance unavailable.' : credits + (credits === 1 ? ' application credit' : ' application credits')}</p>
          <div className="suggestion-actions">
            <button className="btn light" onClick={onRefreshCredits}>Refresh balance</button>
            <button className="btn light" onClick={onManage}>Manage billing</button>
            <button className="btn light" disabled={pending} onClick={async () => {
              const { error } = await client.auth.signOut();
              if (error) setMessage('Sign-out failed. Try again.');
            }}>Sign out</button>
          </div>
        </section>
        <section className="account-card fields-stack">
          <h2>Online resume versions</h2>
          <form className="fields-stack" onSubmit={storeVersion}>
            <label className="field"><span>Version title</span><input value={title} disabled={pending}
              onChange={event => setTitle(event.target.value)} maxLength={80} required /></label>
            <button className="btn primary" disabled={pending || !draft.resume.name.trim()}>
              {savedTitle && savedTitle === title.trim() ? 'Save changes' : 'Save current resume'}
            </button>
          </form>
          {versions.length > 0 && <>
            <label className="field"><span>Saved version</span><select value={savedTitle} disabled={pending} onChange={event => {
              setSavedTitle(event.target.value);
              setTitle(event.target.value);
            }}>
              <option value="">Select a version</option>
              {versions.map(version => <option key={version.title} value={version.title}>{version.title}</option>)}
            </select></label>
            <div className="suggestion-actions">
              <button className="btn light" disabled={pending || !savedTitle} onClick={() => {
                const stored = readDraft(versions.find(version => version.title === savedTitle)?.draft);
                if (!stored) { setMessage('This version could not be opened.'); return; }
                if (window.confirm('Open this version in the editor and replace your current browser draft?')) onLoad(stored);
              }}>Open in editor</button>
              <button className="btn light" disabled={pending || !savedTitle} onClick={deleteVersion}>Delete version</button>
            </div>
          </>}
        </section>
      </div> : <section className="account-card auth-card fields-stack">
        <h2>{{ signin: 'Sign in', signup: 'Create an account', reset: 'Reset your password', password: 'Choose a new password' }[mode]}</h2>
        <form className="fields-stack" onSubmit={submitAccount}>
          {mode !== 'password' && <label className="field"><span>Email address</span>
            <input name="email" type="email" autoComplete="email" required /></label>}
          {mode !== 'reset' && <label className="field"><span>Password</span>
            <input name="password" type="password" autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              minLength={mode === 'signin' ? undefined : 8} required /></label>}
          <button className="btn primary" disabled={pending}>
            {{ signin: 'Sign in', signup: 'Create account', reset: 'Send reset link', password: 'Update password' }[mode]}
          </button>
        </form>
        {mode !== 'password' && <div className="suggestion-actions">
          <button className="btn light" disabled={pending} onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMessage(''); }}>
            {mode === 'signin' ? 'Create account' : 'Back to sign in'}
          </button>
          {mode === 'signin' && <button className="btn light" disabled={pending} onClick={() => { setMode('reset'); setMessage(''); }}>Forgot password?</button>}
        </div>}
      </section>}
    {message && <p role="status">{message}</p>}
  </main>;
}
