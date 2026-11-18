import { NextResponse } from 'next/server';
import { adminDatabase, apiError, getAccount } from '../../../lib/server-account';

export async function GET(request: Request) {
  try {
    const user = await getAccount(request);
    const db = adminDatabase();
    const { data, error } = await db.from('application_grants')
      .select('remaining, subscription_id')
      .eq('user_id', user.id).eq('revoked', false)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString());
    if (error) throw error;
    const credits = data.reduce((total, grant) => total + grant.remaining, 0);
    return NextResponse.json({ credits, pro: data.some(grant => grant.subscription_id) },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return apiError(error);
  }
}
