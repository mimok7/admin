import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// 서버에서 감지되는 환경변수 존재 여부만 boolean으로 보고 (값은 절대 노출하지 않음)
export async function GET() {
  const has = (k: string) => !!(process.env[k] && String(process.env[k]).trim().length > 0);

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    env: {
      NEXT_PUBLIC_SUPABASE_URL: has('NEXT_PUBLIC_SUPABASE_URL'),
      NEXT_PUBLIC_SUPABASE_ANON_KEY: has('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
      SUPABASE_SERVICE_ROLE_KEY: has('SUPABASE_SERVICE_ROLE_KEY'),
      SUPABASE_DB_URL: has('SUPABASE_DB_URL'),
      GITHUB_BACKUP_TOKEN: has('GITHUB_BACKUP_TOKEN') || has('GITHUB_TOKEN'),
      GOOGLE_DRIVE_FOLDER_ID: has('GOOGLE_DRIVE_FOLDER_ID'),
      GOOGLE_SERVICE_ACCOUNT_JSON: has('GOOGLE_SERVICE_ACCOUNT_JSON'),
      GOOGLE_SERVICE_ACCOUNT_EMAIL: has('GOOGLE_SERVICE_ACCOUNT_EMAIL'),
      GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: has('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY'),
    },
  });
}
