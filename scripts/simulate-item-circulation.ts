import { ITEM_IDS, type ItemInstance } from '../src/game/ItemState';
import { runCompetentDay } from '../src/survival/balanceSimulation';
import { survivalEventById } from '../src/survival/eventCatalog';
import { mulberry32 } from '../src/survival/random';
import { SurvivalSession } from '../src/survival/SurvivalSession';
import type { SurvivalSnapshot } from '../src/survival/survivalSnapshot';
import { prepareTradeEvent } from '../src/survival/tradeEvents';
import type { EventResponse, ItemCondition } from '../src/survival/survivalTypes';

interface CirculationStats {
  runs: number;
  gains: number;
  removals: number;
  breaks: number;
  repairs: number;
  firstScubaDays: number[];
  completedDays: number;
  blocked: number;
}

function active(condition: ItemCondition | undefined): boolean {
  return condition === 'usable' || condition === 'broken';
}

function observeChange(before: SurvivalSnapshot, after: SurvivalSnapshot, stats: CirculationStats): void {
  for (const item of Object.values(after.inventory)) {
    if (item === undefined) continue;
    const previous = before.inventory[item.instanceId]?.condition;
    if (previous === item.condition) continue;
    if (!active(previous) && active(item.condition)) stats.gains += 1;
    if (!active(item.condition)) stats.removals += 1;
    if (item.condition === 'broken') stats.breaks += 1;
    if (previous === 'broken' && item.condition === 'usable') stats.repairs += 1;
  }
}

function tradeResponse(session: SurvivalSession, response: EventResponse): EventResponse {
  const snapshot = session.snapshot();
  if (snapshot.pendingEventId !== 'night-trader' && snapshot.pendingEventId !== 'handyman') return response;
  const event = prepareTradeEvent(survivalEventById(snapshot.pendingEventId)!, snapshot);
  if (event.id === 'night-trader') {
    const offer = event.choices.find((choice) => choice.id !== 'sleep'
      && choice.requirements?.every(({ resource, minimum }) => snapshot[resource] >= minimum + 1));
    return offer === undefined ? response : { kind: 'choice', choiceId: offer.id };
  }
  const choice = event.choices.find((entry) => entry.itemId === 'anchor');
  const anchor = Object.values(snapshot.inventory).find((item) => item?.type === 'anchor' && item.condition === 'usable');
  return choice === undefined || anchor === undefined ? response
    : { kind: 'item', choiceId: choice.id, instanceId: anchor.instanceId };
}

function instrument(session: SurvivalSession, stats: CirculationStats): () => number | null {
  let firstScubaDay: number | null = session.snapshot().inventory['scubaSet-1'] ? 0 : null;
  function observe(before: SurvivalSnapshot): void {
    const after = session.snapshot();
    observeChange(before, after, stats);
    if (firstScubaDay === null && Object.values(after.inventory).some((item) =>
      item?.type === 'scubaSet' && item.condition === 'usable')) firstScubaDay = after.day;
  }
  const perform = session.perform.bind(session);
  session.perform = (...args: Parameters<typeof perform>) => {
    const before = session.snapshot();
    const result = perform(...args);
    observe(before);
    return result;
  };
  const resolve = session.resolveEvent.bind(session);
  session.resolveEvent = (response) => {
    const before = session.snapshot();
    const result = resolve(tradeResponse(session, response));
    observe(before);
    return result;
  };
  const finish = session.finishFishing.bind(session);
  session.finishFishing = (...args: Parameters<typeof finish>) => {
    const before = session.snapshot();
    const result = finish(...args);
    observe(before);
    return result;
  };
  return () => firstScubaDay;
}

function maintainEquipment(session: SurvivalSession): void {
  for (const item of Object.values(session.snapshot().inventory)) {
    if (item?.condition !== 'broken') continue;
    session.perform('repairItem', { kind: 'itemRepair', target: item.instanceId });
  }
  session.perform('openChest');
}

function runCohort(saved: readonly ItemInstance[]): object {
  const stats: CirculationStats = { runs: 100, gains: 0, removals: 0, breaks: 0,
    repairs: 0, firstScubaDays: [], completedDays: 0, blocked: 0 };
  for (let seed = 1; seed <= stats.runs; seed += 1) {
    const session = new SurvivalSession(saved, { seed });
    const firstScuba = instrument(session, stats);
    const policyRandom = mulberry32(seed ^ 0x9e3779b9);
    let steps = 0;
    while (session.snapshot().ending === null && session.snapshot().day <= 120 && steps++ < 150) {
      maintainEquipment(session);
      runCompetentDay(session, policyRandom, 0.9, true);
    }
    stats.completedDays += session.snapshot().day;
    if (session.snapshot().ending === null) stats.blocked += 1;
    const day = firstScuba();
    if (day !== null) stats.firstScubaDays.push(day);
  }
  const totalScubaDays = stats.firstScubaDays.reduce((sum, day) => sum + day, 0);
  return { runs: stats.runs, gains: stats.gains, removals: stats.removals,
    breaks: stats.breaks, repairs: stats.repairs, completedDays: stats.completedDays,
    blocked: stats.blocked, runsWithScuba: stats.firstScubaDays.length,
    averageFirstScubaDay: stats.firstScubaDays.length === 0 ? null : totalScubaDays / stats.firstScubaDays.length };
}

const equipment: ItemInstance[] = ITEM_IDS.filter((id) => id !== 'carlitos')
  .map((type) => ({ type, instanceId: `${type}-1` }));
console.log(JSON.stringify({
  policy: 'Existing competent-day policy; repair broken gear, open chests, buy affordable trader stock, exchange anchor for scuba.',
  emptyStart: runCohort([]),
  equippedStart: runCohort(equipment),
}, null, 2));
