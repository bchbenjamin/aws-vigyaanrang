import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { username, password } = body;

  const validUser = process.env.ADMIN_USERNAME;
  const validPass = process.env.ADMIN_PASSWORD;

  if (username === validUser && password === validPass) {
    // Simple token for LAN use (base64 encoded credentials)
    const token = Buffer.from(`${username}:${Date.now()}`).toString('base64');
    return NextResponse.json({ success: true, token });
  }

  return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 });
}
