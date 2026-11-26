// StreakSystem — kill-streak counter + voice lanes (QUIPS_LIBRARY.md canon,
// Lotty, Nov 24, 2026). These tests pin the locked laws:
//   - 6 s window, refreshed per kill; the streak counts from 3
//   - announcer counts 3–10, riding the milestone (exempt from the cooldown)
//   - narrator quips at milestones, tiered 3 / 4 / 5–7 / 8+, queued behind
//     the count when both land on one kill
//   - shared 20 s cooldown across narrator + phantom + whisperer
//   - one voice line at a time, across every lane
//   - phantom ONLY when a streak >= 8 ends by hits (never on timeout);
//     streak >= 12 draws from the reserved lines 13–14 alone
//   - whisperer scarcity: chance roll, long minimum gap, shuffle-bag
//     no-repeat until the pool has cycled; whisper plays DRY (zero reverb)
//   - combo callback on milestone counts 3–10 only
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  StreakSystem,
  ShuffleBag,
  STREAK_WINDOW_MS,
  VOICE_COOLDOWN_MS,
  WHISPER_MIN_GAP_MS,
  narratorTierForStreak,
} from './streakSystem.js';

// ---------- harness ----------

function makeSystem({ lines = null, random = () => 0 } = {}) {
  const clock = { t: 0 };
  const played = [];
  const captions = [];
  const combos = [];
  const sys = new StreakSystem({
    nowMs: () => clock.t,
    random,
    playAudio: async (url, entry, busOptions) => {
      played.push({ url, entry, busOptions });
      return true;
    },
    onCaption: (text, dur) => captions.push({ text, dur }),
    onCombo: (count) => combos.push(count),
    initialLines: lines,
  });
  return { sys, clock, played, captions, combos };
}

const fakeAnnouncer = (durationSec = 0.1) =>
  [3, 4, 5, 6, 7, 8, 9, 10].map((c) => ({
    count: c,
    text: `COUNT ${c}`,
    audioFile: `/fake/announcer_${c}.mp3`,
    durationSec,
  }));

const fakeNarrator = (durationSec = 0.1) =>
  ['3', '4', '5-7', '8+'].map((tier, i) => ({
    id: i + 1,
    tier,
    text: `NARRATOR ${tier}`,
    audioFile: `/fake/narrator_${tier}.mp3`,
    durationSec,
  }));

const fakePhantom = (durationSec = 0.1) => [
  ...Array.from({ length: 12 }, (_, i) => ({
    id: i + 1,
    tier: 'standard',
    text: `PHANTOM ${i + 1}`,
    audioFile: `/fake/phantom_${i + 1}.mp3`,
    durationSec,
  })),
  ...[13, 14].map((id) => ({
    id,
    tier: 'ultra',
    text: `PHANTOM ${id}`,
    audioFile: `/fake/phantom_${id}.mp3`,
    durationSec,
  })),
];

const fakeWhisperer = (n = 5, durationSec = 0.1) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    text: `WHISPER ${i + 1}`,
    audioFile: `/fake/whisperer_${i + 1}.mp3`,
    durationSec,
  }));

async function killTimes(h, times) {
  let last = null;
  for (const t of times) {
    h.clock.t = t;
    last = await h.sys.onKill();
  }
  return last;
}

// ---------- window + threshold ----------

test('streak: the 6s window refreshes per kill and a lapse restarts the count', async () => {
  const h = makeSystem({ lines: { announcer: fakeAnnouncer() } });
  await killTimes(h, [0, 5900, 11800, 17700]);
  assert.equal(h.sys.streak, 4, 'gaps under the window keep the streak alive');
  h.clock.t = 17700 + STREAK_WINDOW_MS + 1;
  const res = await h.sys.onKill();
  assert.equal(res.streak, 1, 'a gap past the window ends the old streak before the new kill counts');
});

test('streak: kills 1 and 2 are silent — no count, no combo', async () => {
  const h = makeSystem({ lines: { announcer: fakeAnnouncer(), narrator: fakeNarrator() } });
  const r1 = await killTimes(h, [0]);
  const r2 = await killTimes(h, [100]);
  assert.equal(r1.announcer, null);
  assert.equal(r2.announcer, null);
  assert.equal(r2.combo, false);
  assert.deepEqual(h.combos, []);
  assert.equal(h.played.length, 0);
});

test('streak: kill 3 fires the count and the combo', async () => {
  const h = makeSystem({ lines: { announcer: fakeAnnouncer() } });
  const r = await killTimes(h, [0, 100, 200]);
  assert.equal(r.streak, 3);
  assert.equal(r.combo, true);
  assert.equal(r.announcer.audioFile, '/fake/announcer_3.mp3');
  assert.deepEqual(h.combos, [3]);
});

// ---------- announcer ----------

test('announcer: counts 3-10 each play their own clip; 11+ has no count', async () => {
  const h = makeSystem({ lines: { announcer: fakeAnnouncer() } });
  const times = Array.from({ length: 12 }, (_, i) => i * 200);
  await killTimes(h, times);
  const counts = h.played.map((p) => p.url);
  assert.deepEqual(counts, [3, 4, 5, 6, 7, 8, 9, 10].map((c) => `/fake/announcer_${c}.mp3`));
});

test('combo: the callback fires on milestone counts 3-10 only, never on 1, 2 or 11+', async () => {
  const h = makeSystem({ lines: { announcer: fakeAnnouncer() } });
  await killTimes(h, Array.from({ length: 12 }, (_, i) => i * 200));
  assert.deepEqual(h.combos, [3, 4, 5, 6, 7, 8, 9, 10]);
});

// ---------- narrator tiers + queue ----------

test('narrator: tier mapping follows the library bands', () => {
  assert.equal(narratorTierForStreak(2), null);
  assert.equal(narratorTierForStreak(3), '3');
  assert.equal(narratorTierForStreak(4), '4');
  assert.equal(narratorTierForStreak(5), '5-7');
  assert.equal(narratorTierForStreak(7), '5-7');
  assert.equal(narratorTierForStreak(8), '8+');
  assert.equal(narratorTierForStreak(15), '8+');
});

test('narrator: a milestone quip comes from the tier of the current count', async () => {
  const cases = [
    { streak: 3, tier: '3' },
    { streak: 4, tier: '4' },
    { streak: 6, tier: '5-7' },
    { streak: 9, tier: '8+' },
  ];
  for (const { streak, tier } of cases) {
    // No announcer pool: the quip fires directly on the milestone kill.
    // The streak is pre-built white-box so the tier is read at exactly the
    // target count (in live play the 20s cooldown, not the tier map, is
    // what spaces quips out).
    const h = makeSystem({ lines: { narrator: fakeNarrator() } });
    h.sys.streak = streak - 1;
    h.sys._lastKillAtMs = 0;
    h.clock.t = 100;
    const r = await h.sys.onKill();
    assert.equal(r.streak, streak);
    assert.ok(r.narrator, `streak ${streak}: a quip fires`);
    assert.equal(r.narrator.tier, tier, `streak ${streak} draws from tier ${tier}`);
    assert.equal(h.captions.length, 1, 'the quip is captioned when it plays');
    assert.equal(h.captions[0].text, `NARRATOR ${tier}`);
  }
});

test('narrator: when a count and a quip land on one kill, the count plays first and the quip follows', async () => {
  const h = makeSystem({ lines: { announcer: fakeAnnouncer(0.5), narrator: fakeNarrator(0.5) } });
  const r = await killTimes(h, [0, 100, 200]);
  assert.equal(r.announcer.audioFile, '/fake/announcer_3.mp3');
  assert.equal(r.narrator, null, 'the quip must not overlap the count');
  assert.equal(r.narratorQueued, true);
  assert.deepEqual(h.played.map((p) => p.url), ['/fake/announcer_3.mp3']);

  h.clock.t = 400; // count still playing (until 700)
  h.sys.update();
  assert.equal(h.played.length, 1, 'update() does not fire the quip over the count');

  h.clock.t = 800; // count finished
  h.sys.update();
  assert.deepEqual(
    h.played.map((p) => p.url),
    ['/fake/announcer_3.mp3', '/fake/narrator_3.mp3'],
    'the queued quip follows the count'
  );
});

test('narrator: a queued quip dies with the streak', async () => {
  const h = makeSystem({ lines: { announcer: fakeAnnouncer(0.5), narrator: fakeNarrator(0.5), phantom: fakePhantom() } });
  await killTimes(h, [0, 100, 200]);
  assert.equal(h.sys.getState().narratorQueued, true);
  h.clock.t = 300;
  await h.sys.onPlayerHit(); // streak 3 ends by hits — no phantom, and the queue is cleared
  h.clock.t = 5000;
  h.sys.update();
  assert.deepEqual(h.played.map((p) => p.url), ['/fake/announcer_3.mp3'], 'the quip never fires after the streak ends');
});

// ---------- shared cooldown + one voice at a time ----------

test('cooldown: narrator + phantom share 20s; the announcer rides through it', async () => {
  const h = makeSystem({ lines: { announcer: fakeAnnouncer(), narrator: fakeNarrator(), phantom: fakePhantom() } });
  // Streak 3 at t=200: count plays, quip queues; flush it at t=400.
  await killTimes(h, [0, 100, 200]);
  h.clock.t = 400;
  h.sys.update();
  assert.deepEqual(h.played.map((p) => p.url), ['/fake/announcer_3.mp3', '/fake/narrator_3.mp3']);
  const quipAt = 400;

  // Inside the cooldown the count still fires on the next milestone…
  const r5 = await killTimes(h, [600, 800]); // streak 4, then 5
  assert.equal(r5.announcer.audioFile, '/fake/announcer_5.mp3', 'announcer is exempt from the voice cooldown');
  // …but no second quip is queued or played.
  assert.equal(h.played.filter((p) => p.url.startsWith('/fake/narrator_')).length, 1);
  assert.equal(h.sys.getState().narratorQueued, false);

  // Keep the streak alive through the cooldown with filler kills, then the
  // first milestone after the cooldown draws the 8+ tier quip.
  await killTimes(h, [5000, 10000, 15000, 20000]); // streak 6,7,8,9
  assert.equal(h.played.filter((p) => p.url.startsWith('/fake/narrator_')).length, 1, 'still no quip inside the cooldown');
  h.clock.t = quipAt + VOICE_COOLDOWN_MS + 100;
  const r10 = await h.sys.onKill(); // streak 10
  assert.equal(r10.narratorQueued, true, 'after the cooldown the quip lane reopens');
  h.clock.t += 200;
  h.sys.update();
  const quips = h.played.filter((p) => p.url.startsWith('/fake/narrator_'));
  assert.equal(quips.length, 2);
  assert.equal(quips[1].entry.tier, '8+');
});

test('one voice at a time: a playing line blocks every other lane', async () => {
  const h = makeSystem({
    lines: { announcer: fakeAnnouncer(5), narrator: fakeNarrator(5), phantom: fakePhantom(), whisperer: fakeWhisperer() },
  });
  await killTimes(h, [0, 100, 200]); // count plays for 5s (until 5200), quip queued behind it
  h.clock.t = 300;
  const whisper = await h.sys.requestWhisper();
  assert.equal(whisper.played, false);
  assert.equal(whisper.reason, 'voice_busy');
  // A hit while the count plays: the streak ends, the candy is suppressed.
  await killTimes(h, [400, 500, 600, 700, 800]); // streak back up to 8 — counts blocked by the playing line
  assert.equal(h.sys.streak, 8);
  const hit = await h.sys.onPlayerHit();
  assert.equal(hit.endedStreak, 8);
  assert.equal(hit.phantom, null);
  assert.equal(hit.reason, 'voice_busy');
  assert.equal(h.sys.streak, 0, 'the hit ends the streak even when the candy is suppressed');
});

// ---------- phantom ----------

test('phantom: a streak of 8 ended by hits draws from the standard pool', async () => {
  const h = makeSystem({ lines: { announcer: fakeAnnouncer(), phantom: fakePhantom() } });
  await killTimes(h, Array.from({ length: 8 }, (_, i) => i * 200));
  h.clock.t = 2000;
  const hit = await h.sys.onPlayerHit();
  assert.equal(hit.endedStreak, 8);
  assert.ok(hit.phantom, 'the candy fires');
  assert.ok(hit.phantom.id >= 1 && hit.phantom.id <= 12, 'standard pool is lines 1-12');
  assert.equal(hit.phantom.tier, 'standard');
  assert.equal(h.sys.streak, 0);
  assert.equal(h.captions.length, 1, 'the candy is captioned when it plays');
});

test('phantom: a streak of 8 ending by TIMEOUT never fires the candy', async () => {
  const h = makeSystem({ lines: { announcer: fakeAnnouncer(), phantom: fakePhantom() } });
  await killTimes(h, Array.from({ length: 8 }, (_, i) => i * 200));
  h.clock.t = 1600 + STREAK_WINDOW_MS + 1;
  const res = h.sys.update();
  assert.equal(res.expired, true);
  assert.equal(res.endedStreak, 8);
  assert.equal(h.sys.streak, 0);
  assert.equal(h.played.filter((p) => p.url.startsWith('/fake/phantom_')).length, 0, 'timeout is silent — no candy');
});

test('phantom: a streak of 7 ended by hits is below the threshold', async () => {
  const h = makeSystem({ lines: { announcer: fakeAnnouncer(), phantom: fakePhantom() } });
  await killTimes(h, Array.from({ length: 7 }, (_, i) => i * 200));
  h.clock.t = 1600;
  const hit = await h.sys.onPlayerHit();
  assert.equal(hit.endedStreak, 7);
  assert.equal(hit.phantom, null);
  assert.equal(hit.reason, 'below_threshold');
  assert.equal(h.sys.streak, 0, 'any hit ends the streak');
});

test('phantom: a streak of 12 ended by hits draws ONLY from the reserved lines 13-14', async () => {
  const h = makeSystem({ lines: { announcer: fakeAnnouncer(), phantom: fakePhantom() } });
  await killTimes(h, Array.from({ length: 12 }, (_, i) => i * 200));
  h.clock.t = 2600;
  const hit = await h.sys.onPlayerHit();
  assert.equal(hit.endedStreak, 12);
  assert.ok(hit.phantom);
  assert.ok(hit.phantom.id === 13 || hit.phantom.id === 14, 'ultra pool is lines 13-14 alone');
  assert.equal(hit.phantom.tier, 'ultra');
});

test('phantom: the shared cooldown can suppress the candy — and a suppressed candy is lost', async () => {
  const h = makeSystem({ lines: { narrator: fakeNarrator(), phantom: fakePhantom() } });
  await killTimes(h, [0, 100, 200]); // streak 3 quip fires at t=200 (no announcer pool)
  assert.equal(h.played.filter((p) => p.url.startsWith('/fake/narrator_')).length, 1);
  await killTimes(h, [5000, 10000, 15000, 19000, 19900]); // streak 8, still inside the 20s cooldown
  assert.equal(h.sys.streak, 8);
  h.clock.t = 20050;
  const hit = await h.sys.onPlayerHit();
  assert.equal(hit.phantom, null);
  assert.equal(hit.reason, 'cooldown');
  assert.equal(h.sys.streak, 0);
  // Long after the cooldown, nothing retro-fires.
  h.clock.t = 90000;
  h.sys.update();
  assert.equal(h.played.filter((p) => p.url.startsWith('/fake/phantom_')).length, 0);
});

// ---------- whisperer ----------

test('whisperer: shuffle-bag — no line repeats until the whole pool has cycled', async () => {
  const h = makeSystem({ lines: { whisperer: fakeWhisperer(5) } });
  const seen = [];
  for (let i = 0; i < 5; i++) {
    h.clock.t = i * (WHISPER_MIN_GAP_MS + VOICE_COOLDOWN_MS);
    const res = await h.sys.requestWhisper();
    assert.equal(res.played, true, `whisper ${i + 1} plays when every gate is open`);
    seen.push(res.line.audioFile);
  }
  assert.equal(new Set(seen).size, 5, 'five whispers, five different lines');
  h.clock.t = 5 * (WHISPER_MIN_GAP_MS + VOICE_COOLDOWN_MS);
  const sixth = await h.sys.requestWhisper();
  assert.equal(sixth.played, true, 'the bag refills once the pool has cycled');
  assert.ok(seen.includes(sixth.line.audioFile), 'the new cycle draws from the same pool');
});

test('whisperer: scarcity gates — chance roll and the long minimum gap', async () => {
  let roll = 0.99;
  const h = makeSystem({ lines: { whisperer: fakeWhisperer(3) }, random: () => roll });
  h.clock.t = 0;
  const unlucky = await h.sys.requestWhisper();
  assert.equal(unlucky.played, false);
  assert.equal(unlucky.reason, 'chance', 'most requests whisper nothing');

  roll = 0; // the roll passes now
  const first = await h.sys.requestWhisper();
  assert.equal(first.played, true);
  assert.equal(first.line.audioFile.startsWith('/fake/whisperer_'), true);
  assert.equal(h.played[0].busOptions.dry, true, 'the whisperer plays DRY — zero reverb, never the hall bus');

  h.clock.t = WHISPER_MIN_GAP_MS - 1;
  const tooSoon = await h.sys.requestWhisper();
  assert.equal(tooSoon.played, false);
  assert.equal(tooSoon.reason, 'too_soon', 'never back-to-back');
});

test('shuffle bag: draws are exhaustive before any repeat (direct)', () => {
  const bag = new ShuffleBag(['a', 'b', 'c'], () => 0.42);
  const draws = [bag.draw(), bag.draw(), bag.draw()];
  assert.deepEqual([...draws].sort(), ['a', 'b', 'c']);
  assert.ok(['a', 'b', 'c'].includes(bag.draw()), 'fourth draw opens a fresh cycle');
  assert.equal(new ShuffleBag([], () => 0).draw(), null);
});

// ---------- the real library ----------

test('library: the shipped streak_lines.json carries the full canon (8/24/14/50)', async () => {
  process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
  const h = makeSystem();
  const loaded = await h.sys.load();
  assert.equal(loaded, true);
  assert.equal(h.sys.getVoicedCount(), 96);
  assert.deepEqual([...h.sys.announcerByCount.keys()].sort((a, b) => a - b), [3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(h.sys.announcerByCount.get(10).audioFile, '/audio/streak/announcer/streak_10.mp3');
  assert.equal(h.sys.narratorBags.get('3').size, 6);
  assert.equal(h.sys.narratorBags.get('4').size, 6);
  assert.equal(h.sys.narratorBags.get('5-7').size, 6);
  assert.equal(h.sys.narratorBags.get('8+').size, 6);
  assert.equal(h.sys.phantomBags.get('standard').size, 12);
  assert.equal(h.sys.phantomBags.get('ultra').size, 2);
  assert.equal(h.sys.whisperBag.size, 50);
});

// ---------- wiring pins (source) ----------

const mainSrc = readFileSync(new URL('../main.js', import.meta.url), 'utf8');
const cssSrc = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

test('wiring: main.js hooks the streak system at the kill + damage callbacks', () => {
  assert.ok(mainSrc.includes("from './audio/streakSystem.js'"), 'main.js must import the streak system');
  assert.equal(
    mainSrc.split('streakSystem?.onKill()').length - 1,
    5,
    'onKill hooks all five EnemyManager kill callbacks (zombie/ghost/ghoul/lion/whisperer)'
  );
  assert.ok(
    mainSrc.includes('streakSystem?.requestWhisper()'),
    'the Whisperer entity is the first requestWhisper caller (onWhisperCue)'
  );
  assert.ok(mainSrc.includes('streakSystem?.onPlayerHit()'), 'onPlayerDamaged feeds the phantom trigger');
  assert.ok(mainSrc.includes('streakSystem?.reset()'), 'player death resets the streak silently');
  assert.ok(mainSrc.includes('streakSystem?.update()'), 'the frame loop drives timeout + queued quips');
  assert.ok(mainSrc.includes('id="streak-combo"'), 'the milestone combo overlay exists in the HUD');
});

test('wiring: the combo text carries the Street Fighter style classes', () => {
  assert.ok(cssSrc.includes('.streak-combo-text'), 'index.css styles the combo count');
  assert.ok(cssSrc.includes('.streak-splat'), 'index.css styles the blood splatter');
});
