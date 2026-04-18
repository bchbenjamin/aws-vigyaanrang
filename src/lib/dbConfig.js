const { neon } = require('@neondatabase/serverless');

let sql;
let initialized = false;

function getSql() {
  if (!sql) {
    sql = neon(process.env.DATABASE_URL);
  }
  return sql;
}

async function ensureTables() {
  if (initialized) return;
  const db = getSql();
  try {
    await db`
      CREATE TABLE IF NOT EXISTS admin_config (
        key TEXT PRIMARY KEY,
        value INTEGER NOT NULL
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS cumulative_scores (
        player_name TEXT PRIMARY KEY,
        total_score INTEGER DEFAULT 0,
        last_seen TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS registered_users (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL
      )
    `;
    await db`
      CREATE TABLE IF NOT EXISTS live_scores (
        player_name TEXT PRIMARY KEY,
        current_score INTEGER DEFAULT 0,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    initialized = true;
    console.log('[DB] Tables ensured.');
  } catch (err) {
    console.error('[DB] Failed to ensure tables:', err.message);
  }
}

async function loadAdminConfig(defaults) {
  await ensureTables();
  const db = getSql();
  try {
    const rows = await db`SELECT key, value FROM admin_config`;
    const config = { ...defaults };
    for (const row of rows) {
      if (row.key in config) {
        config[row.key] = row.value;
      }
    }
    console.log('[DB] Loaded admin config:', Object.keys(config).length, 'keys');
    return config;
  } catch (err) {
    console.error('[DB] Failed to load admin config:', err.message);
    return defaults;
  }
}

async function saveAdminConfig(configObj) {
  await ensureTables();
  const db = getSql();
  try {
    for (const [key, value] of Object.entries(configObj)) {
      await db`
        INSERT INTO admin_config (key, value)
        VALUES (${key}, ${value})
        ON CONFLICT (key) DO UPDATE SET value = ${value}
      `;
    }
  } catch (err) {
    console.error('[DB] Failed to save admin config:', err.message);
  }
}

async function saveCumulativeScores(scores, players) {
  await ensureTables();
  const db = getSql();
  try {
    for (const [id, score] of Object.entries(scores)) {
      const player = players[id];
      if (!player || !player.name) continue;
      await db`
        INSERT INTO cumulative_scores (player_name, total_score, last_seen)
        VALUES (${player.name}, ${score}, NOW())
        ON CONFLICT (player_name) DO UPDATE
          SET total_score = cumulative_scores.total_score + ${score},
              last_seen = NOW()
      `;
    }
    console.log('[DB] Saved cumulative scores.');
  } catch (err) {
    console.error('[DB] Failed to save cumulative scores:', err.message);
  }
}

async function loadCumulativeScores() {
  await ensureTables();
  const db = getSql();
  try {
    const rows = await db`SELECT player_name, total_score, last_seen FROM cumulative_scores ORDER BY total_score DESC`;
    return rows;
  } catch (err) {
    console.error('[DB] Failed to load cumulative scores:', err.message);
    return [];
  }
}

async function resetCumulativeScores() {
  await ensureTables();
  const db = getSql();
  try {
    await db`DELETE FROM cumulative_scores`;
    console.log('[DB] Reset cumulative scores.');
  } catch (err) {
    console.error('[DB] Failed to reset cumulative scores:', err.message);
  }
}

async function loadRegisteredUsers() {
  await ensureTables();
  const db = getSql();
  try {
    const rows = await db`SELECT code, name FROM registered_users`;
    const users = {};
    for (const row of rows) {
      users[row.code] = row.name;
    }
    console.log('[DB] Loaded registered users:', Object.keys(users).length);
    return users;
  } catch (err) {
    console.error('[DB] Failed to load registered users:', err.message);
    return {};
  }
}

async function saveRegisteredUser(code, name) {
  await ensureTables();
  const db = getSql();
  try {
    await db`
      INSERT INTO registered_users (code, name)
      VALUES (${code}, ${name})
      ON CONFLICT (code) DO UPDATE SET name = ${name}
    `;
  } catch (err) {
    console.error('[DB] Failed to save registered user:', err.message);
  }
}

async function removeRegisteredUser(code) {
  await ensureTables();
  const db = getSql();
  try {
    await db`DELETE FROM registered_users WHERE code = ${code}`;
  } catch (err) {
    console.error('[DB] Failed to remove registered user:', err.message);
  }
}

async function saveLiveScore(playerName, currentScore) {
  await ensureTables();
  const db = getSql();
  try {
    await db`
      INSERT INTO live_scores (player_name, current_score, updated_at)
      VALUES (${playerName}, ${currentScore}, NOW())
      ON CONFLICT (player_name) DO UPDATE
        SET current_score = ${currentScore},
            updated_at = NOW()
    `;
  } catch (err) {
    console.error('[DB] Failed to save live score:', err.message);
  }
}

async function clearLiveScores() {
  await ensureTables();
  const db = getSql();
  try {
    await db`DELETE FROM live_scores`;
  } catch (err) {
    console.error('[DB] Failed to clear live scores:', err.message);
  }
}

module.exports = {
  loadAdminConfig,
  saveAdminConfig,
  saveCumulativeScores,
  loadCumulativeScores,
  resetCumulativeScores,
  loadRegisteredUsers,
  saveRegisteredUser,
  removeRegisteredUser,
  saveLiveScore,
  clearLiveScores,
};
