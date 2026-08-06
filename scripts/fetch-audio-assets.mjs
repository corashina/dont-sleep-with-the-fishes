import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptRoot, '..');
const assetRoot = join(projectRoot, 'src', 'assets', 'audio');
const force = process.argv.includes('--force');

const freesoundSources = [
  ['calmOcean', 'SamsterBirdies', '578524'],
  ['roughOcean', 'frodeims', '616222'],
  ['lightWind', 'Vrymaa', '734663'],
  ['strongWind', 'SamsterBirdies', '565140'],
  ['rain', 'Snoopy20111', '399072'],
  ['thunderLightning', 'Yoyodaman234', '267551'],
  ['roomTone', 'kyles', '454012'],
  ['shipAlarm', 'InfamousLazure', '584001'],
  ['woodStep', 'SoundsAreGr8', '340983'],
  ['jump', 'florianreichelt', '683101'],
  ['itemHandling', 'petenice', '9509'],
  ['boatCreak', 'craigsmith', '675783'],
  ['lightWaveImpact', 'kyles', '637645'],
  ['hardWaveImpact', 'Sheyvan', '520511'],
  ['confirm', 'qubodup', '822568'],
  ['denied', 'Rob_Marion', '542040'],
  ['pause', 'BenjaminNelan', '321083'],
  ['resume', 'Leszek_Szary', '146720'],
  ['journal', 'mateusboga', '614081'],
  ['eating', 'User391915396', '570336'],
  ['medkit', 'SecureSubset', '800275'],
  ['hullRepair', 'zbig77', '244985'],
  ['tapeRepair', 'baidonovan', '187338'],
  ['ductTapePickup', 'Geoff-Bremner-Audio', '795714', 'attribution'],
  ['diveEntry', 'Urkki69', '628350'],
  ['underwaterMovement', 'Tim_Verberne', '484187'],
  ['diveSurface', 'audiosmedia', '243519'],
  ['fishingCast', 'mwchristian95', '725425'],
  ['fishingBite', 'paulprit', '507094'],
  ['fishingReel', 'mwchristian95', '725424'],
  ['fishCatch', 'RatBird', '570208'],
  ['junkCatch', 'loganzsound', '850720'],
  ['fishingMiss', 'Vrymaa', '802697'],
  ['bucketRain', 'TheGloomWorker', '683249'],
  ['umbrella', 'randbsoundbites', '792526'],
  ['anchorChain', 'kyles', '452577'],
  ['flashlight', 'Rudmer_Rotteveel', '457458'],
  ['flareGun', 'derplayer', '587173'],
  ['shotgun', 'hyperix6', '660299'],
  ['goingToSleep', 'Froey_', '644490'],
  ['yawn', 'spookymodem', '202105'],
  ['nightfall', 'DeVern', '427533'],
  ['eventReveal', 'nomiqbomi', '578362'],
  ['tentacleMovement', 'iampagan', '177017'],
  ['chest', 'The_Frisbee_of_Peace', '573654'],
  ['driftingCargo', 'hz37', '792375'],
  ['rescueEnding', 'Lydmakeren', '510907'],
  ['deathEnding', 'SilverIllusionist', '693405'],
  ['sinkingEnding', 'Kodack', '257752'],
  ['scavengeChase', 'Victor_Natas', '634513', 'attribution'],
  ['scavengeCountdown', 'qubodup', '211102', 'attribution'],
];

async function hasFile(path) {
  if (force) return false;
  try {
    return (await stat(path)).size > 0;
  } catch {
    return false;
  }
}

async function fetchBuffer(url) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(url, {
      headers: { 'user-agent': 'dont-sleep-with-the-fishes asset fetcher' },
    });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
    if (attempt === 3) {
      throw new Error(`${response.status} ${response.statusText}: ${url}`);
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 750 * (attempt + 1)));
  }
  throw new Error(`Download attempts exhausted: ${url}`);
}

async function fetchFreesound([id, user, number, license = 'cc0']) {
  const destination = join(assetRoot, `${id}.mp3`);
  if (await hasFile(destination)) return;
  const pageUrl = `https://freesound.org/people/${user}/sounds/${number}/`;
  let page = '';
  for (let attempt = 0; attempt < 4; attempt += 1) {
    page = (await fetchBuffer(pageUrl)).toString('utf8');
    const licenseFound = license === 'cc0'
      ? page.includes('Creative Commons 0')
      : page.includes('Attribution');
    if (licenseFound) break;
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000 * (attempt + 1)));
  }
  const licenseFound = license === 'cc0'
    ? page.includes('Creative Commons 0')
    : page.includes('Attribution');
  if (!licenseFound) {
    throw new Error(`The page did not return its ${license} record: ${pageUrl}`);
  }
  const previewUrl = page.match(
    /https:\/\/cdn\.freesound\.org\/previews\/[^"']+-hq\.mp3/,
  )?.[0];
  if (previewUrl === undefined) throw new Error(`No HQ MP3 preview: ${pageUrl}`);
  const audio = await fetchBuffer(previewUrl);
  if (audio.length === 0) throw new Error(`Empty preview: ${previewUrl}`);
  await writeFile(destination, audio);
  process.stdout.write(`Downloaded ${basename(destination)}\n`);
}

async function runPool(entries, worker, width) {
  let cursor = 0;
  const runners = Array.from({ length: width }, async () => {
    while (cursor < entries.length) {
      const index = cursor;
      cursor += 1;
      await worker(entries[index]);
    }
  });
  await Promise.all(runners);
}

await mkdir(assetRoot, { recursive: true });
await runPool(freesoundSources, fetchFreesound, 4);

const menuAmbientDestination = join(assetRoot, 'menuAmbient.flac');
if (!await hasFile(menuAmbientDestination)) {
  const pageUrl = 'https://opengameart.org/content/eyes-of-the-ocean';
  const page = (await fetchBuffer(pageUrl)).toString('utf8');
  if (!page.includes('CC-BY 4.0')) {
    throw new Error(`The page did not return its CC-BY 4.0 record: ${pageUrl}`);
  }
  await writeFile(
    menuAmbientDestination,
    await fetchBuffer(
      'https://opengameart.org/sites/default/files/dark_eyes_of_the_ocean_0.flac',
    ),
  );
}

const dawnDestination = join(assetRoot, 'dawn.wav');
if (!await hasFile(dawnDestination)) {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'fishes-audio-'));
  const source = join(temporaryRoot, 'dawn.wav');
  try {
    await writeFile(
      source,
      await fetchBuffer('https://opengameart.org/sites/default/files/first_light_particles_0.wav'),
    );
    const trim = spawnSync(
      process.execPath,
      [join(scriptRoot, 'trim-wav.mjs'), source, dawnDestination, '8'],
      { stdio: 'inherit' },
    );
    if (trim.status !== 0) throw new Error('The dawn WAVE trim failed');
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

const results = await Promise.all([
  ...freesoundSources.map(([id]) => stat(join(assetRoot, `${id}.mp3`))),
  stat(menuAmbientDestination),
  stat(dawnDestination),
]);
if (results.some(({ size }) => size <= 0)) throw new Error('An audio asset is empty');
const totalBytes = results.reduce((total, { size }) => total + size, 0);
process.stdout.write(
  `Ready: ${results.length} audio files (${(totalBytes / 1024 / 1024).toFixed(1)} MB).\n`,
);
