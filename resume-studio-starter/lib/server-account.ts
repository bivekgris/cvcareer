import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const authOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

export class AppError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function getAccount(request: Request) {
  if (!url || !publicKey) throw new AppError('Accounts are not configured.', 503);
  const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) throw new AppError('Sign in to continue.', 401);
  const { data, error } = await createClient(url, publicKey, authOptions).auth.getUser(token);
  if (error || !data.user || data.user.is_anonymous) throw new AppError('Sign in to continue.', 401);
  return data.user;
}

export function adminDatabase() {
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new AppError('Credit storage is not configured.', 503);
  return createClient(url, key, authOptions);
}

export function apiError(error: unknown) {
  if (error instanceof AppError) return NextResponse.json({ error: error.message }, { status: error.status });
  return NextResponse.json({ error: 'The service could not complete your request. Try again shortly.' }, { status: 502 });
}
