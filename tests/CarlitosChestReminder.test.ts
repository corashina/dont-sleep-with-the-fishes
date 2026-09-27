// Importance: 98/100. Reminders must reflect actual opening opportunities and survive saved games.
import { expect, it } from 'vitest';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import { createSurvivalSaveDocument, parseSurvivalSaveDocument } from '../src/survival/SurvivalSaveData';

function create(energy = 3, companion = true) {
  return new SurvivalSession(companion ? [{ type: 'carlitos', instanceId: 'carlitos-1' }] : [], {
    seed: 1, radioSignalsEnabled: false, initial: { day: 1, energy },
    initialChest: { state: 'closed', acquiredDay: 1 },
  });
}

function nextDay(session: SurvivalSession, energy = 3) {
  const checkpoint = session.exportCheckpoint();
  return SurvivalSession.restore({ ...checkpoint, day: checkpoint.day + 1, energy });
}

it('waits until the day after an opening opportunity and reminds only once that day', () => {
  let session = create();
  expect(session.canRemindAboutChest()).toBe(false);
  session = nextDay(session);
  expect(session.canRemindAboutChest()).toBe(true);
  session.markChestReminderShown();
  expect(session.canRemindAboutChest()).toBe(false);
  session = SurvivalSession.restore(session.exportCheckpoint());
  expect(session.canRemindAboutChest()).toBe(false);
  session = nextDay(session);
  expect(session.canRemindAboutChest()).toBe(true);
});

it('does not blame the player after three days with only two energy', () => {
  let session = create(2);
  for (let day = 1; day <= 3; day++) {
    expect(session.canRemindAboutChest()).toBe(false);
    expect(session.exportCheckpoint().chestFirstOpenableDay).toBeNull();
    session = nextDay(session, day === 3 ? 3 : 2);
  }
  expect(session.canRemindAboutChest()).toBe(false);
  session = nextDay(session);
  expect(session.canRemindAboutChest()).toBe(true);
});

it('remembers an opportunity even after energy was spent elsewhere', () => {
  let session = create();
  session = SurvivalSession.restore({ ...session.exportCheckpoint(), hull: 80 });
  expect(session.perform('repair').accepted).toBe(true);
  expect(session.snapshot().energy).toBeLessThan(3);
  session = nextDay(session);
  expect(session.canRemindAboutChest()).toBe(true);
});

it('does not remind when Carlitos is absent, energy is low, or the chest was opened', () => {
  expect(nextDay(create(3, false)).canRemindAboutChest()).toBe(false);
  expect(nextDay(create(), 2).canRemindAboutChest()).toBe(false);
  const session = nextDay(create());
  expect(session.perform('openChest').accepted).toBe(true);
  expect(session.canRemindAboutChest()).toBe(false);
  expect(session.exportCheckpoint().chestFirstOpenableDay).toBeNull();
});

it('does not count a night event as a chance to open the chest', () => {
  const session = new SurvivalSession([{ type: 'carlitos', instanceId: 'carlitos-1' }], {
    seed: 1, initial: { day: 3, energy: 3 }, initialEventId: 'quiet-night',
    initialChest: { state: 'closed', acquiredDay: 1 },
  });
  expect(session.exportCheckpoint().chestFirstOpenableDay).toBeNull();
  expect(session.canRemindAboutChest()).toBe(false);
});

it('persists opportunity and delivery and rejects invalid reminder dates', () => {
  const session = create();
  const source = session.exportCheckpoint();
  const restored = SurvivalSession.restore({ ...source, day: 2,
    history: [...source.history, { ...source.history[0]!, day: 2 }] });
  restored.markChestReminderShown();
  const save = createSurvivalSaveDocument({ scavengeElapsedSeconds: 0, session: restored.exportCheckpoint() });
  const parsed = parseSurvivalSaveDocument(JSON.parse(JSON.stringify(save)))!;
  expect(parsed).not.toBeNull();
  expect(SurvivalSession.restore(parsed.checkpoint.session).canRemindAboutChest()).toBe(false);
  for (const dates of [
    { chestFirstOpenableDay: 3 }, { chestFirstOpenableDay: null },
    { chestLastReminderDay: 1 }, { chestLastReminderDay: 3 },
  ]) {
    expect(parseSurvivalSaveDocument({ ...save, checkpoint: { ...save.checkpoint,
      session: { ...save.checkpoint.session, ...dates } } })).toBeNull();
  }
});
