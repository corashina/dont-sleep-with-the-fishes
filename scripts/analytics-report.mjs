// Prints visits by country, game starts, and game ends from Workers Analytics Engine.
const DATASET = 'fishes_events';
const days = Number(process.argv[2] ?? 7);
const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const token = process.env.CLOUDFLARE_API_TOKEN;

if (![7, 30, 90].includes(days)) throw new Error('Day count must be 7, 30, or 90.');
if (!accountId || !token) throw new Error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env.');

const since = `timestamp > NOW() - INTERVAL '${days}' DAY`;

async function query(sql) {
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/analytics_engine/sql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: sql,
  });
  if (!response.ok) throw new Error(`SQL API ${response.status}: ${await response.text()}`);
  return (await response.json()).data;
}

console.log(`Last ${days} days\n\nVisits by country`);
console.table(await query(`
  SELECT blob2 AS country, SUM(_sample_interval) AS visits
  FROM ${DATASET} WHERE blob1 = 'visit' AND ${since}
  GROUP BY country ORDER BY visits DESC`));

console.log('Game starts');
console.table(await query(`
  SELECT SUM(_sample_interval) AS starts
  FROM ${DATASET} WHERE blob1 = 'game_start' AND ${since}`));

console.log('Game ends');
console.table(await query(`
  SELECT blob3 AS ending, SUM(_sample_interval) AS ends, quantileExactWeighted(0.5)(double1, _sample_interval) AS median_day
  FROM ${DATASET} WHERE blob1 = 'game_end' AND ${since}
  GROUP BY ending ORDER BY ends DESC`));
