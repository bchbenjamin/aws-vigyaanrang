import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  // Access the game state exposed by server.js
  const getState = (globalThis as Record<string, unknown>).__getGameState as (() => Record<string, unknown>) | undefined;

  if (!getState) {
    return NextResponse.json({
      error: 'Game server not initialized. Are you running with the custom server.js?',
    }, { status: 503 });
  }

  const state = getState();
  return NextResponse.json(state);
}
