// @vitest-environment jsdom
// Importance: 8/10. Protects modal priority, focus isolation, trapping, and restoration.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ModalFocusManager,
  type ModalInitialFocus,
} from '../src/ui/ModalFocusManager';

const PRIORITY = [
  'pause',
  'journal',
  'repair',
  'ending',
  'dive-result',
  'drifting-focus',
  'fishing-result',
  'fishing-layer',
] as const;

interface Fixture {
  readonly manager: ModalFocusManager;
  readonly topControls: HTMLElement;
  readonly boatAnchors: HTMLElement;
  readonly unrelated: HTMLElement;
  readonly modals: ReadonlyMap<string, HTMLElement>;
  readonly targets: ReadonlyMap<string, HTMLElement>;
}

afterEach(() => {
  document.body.innerHTML = '';
});

function createFixture(): Fixture {
  const topControls = document.createElement('header');
  const boatAnchors = document.createElement('nav');
  const unrelated = document.createElement('aside');
  const modals = new Map<string, HTMLElement>();
  const targets = new Map<string, HTMLElement>();
  const initialFocus = new Map<HTMLElement, ModalInitialFocus>();

  PRIORITY.forEach((name) => {
    const modal = document.createElement('section');
    modal.dataset.modal = name;
    modal.setAttribute('aria-hidden', 'true');
    modal.setAttribute('inert', '');
    const target = name === 'journal' || name === 'repair' || name === 'ending'
      ? document.createElement('h2')
      : document.createElement('button');
    target.dataset.initial = name;
    if (!(target instanceof HTMLButtonElement)) target.tabIndex = -1;
    modal.append(target);
    modals.set(name, modal);
    targets.set(name, target);
    initialFocus.set(
      modal,
      name === 'drifting-focus' || name === 'fishing-layer' ? () => target : target,
    );
  });
  document.body.append(topControls, boatAnchors, unrelated, ...modals.values());
  const manager = new ModalFocusManager(
    [topControls, boatAnchors],
    PRIORITY.map((name) => modals.get(name)!),
    initialFocus,
  );
  manager.sync();
  return { manager, topControls, boatAnchors, unrelated, modals, targets };
}

function keydown(shiftKey = false): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    cancelable: true,
  });
}

describe('ModalFocusManager', () => {
  it('uses the fixed eight-layer priority and isolates only the named backgrounds', () => {
    const fixture = createFixture();

    [...PRIORITY].reverse().forEach((name) => {
      fixture.manager.activate(fixture.modals.get(name)!);
    });

    expect(fixture.manager.topmostModal()).toBe(fixture.modals.get('pause'));
    expect(document.activeElement).toBe(fixture.targets.get('pause'));
    expect(fixture.topControls.hasAttribute('inert')).toBe(true);
    expect(fixture.boatAnchors.hasAttribute('inert')).toBe(true);
    expect(fixture.unrelated.hasAttribute('inert')).toBe(false);

    PRIORITY.forEach((name, index) => {
      const modal = fixture.modals.get(name)!;
      expect(modal.hasAttribute('inert')).toBe(false);
      expect(modal.getAttribute('aria-hidden')).toBe('false');
      fixture.manager.deactivate(modal, false);
      const next = PRIORITY[index + 1];
      expect(fixture.manager.topmostModal()).toBe(
        next === undefined ? null : fixture.modals.get(next),
      );
    });

    expect(fixture.topControls.hasAttribute('inert')).toBe(false);
    expect(fixture.boatAnchors.hasAttribute('inert')).toBe(false);
  });

  it('does not let a lower-priority activation steal focus', () => {
    const fixture = createFixture();
    const pause = fixture.modals.get('pause')!;
    const fishing = fixture.modals.get('fishing-layer')!;

    fixture.manager.activate(pause);
    fixture.manager.activate(fishing);

    expect(fixture.manager.topmostModal()).toBe(pause);
    expect(document.activeElement).toBe(fixture.targets.get('pause'));
    expect(fishing.hasAttribute('inert')).toBe(true);
    expect(fishing.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses each layer initial-focus target or resolver', () => {
    const fixture = createFixture();

    PRIORITY.forEach((name) => {
      const modal = fixture.modals.get(name)!;
      fixture.manager.activate(modal);
      expect(document.activeElement).toBe(fixture.targets.get(name));
      fixture.manager.deactivate(modal, false);
    });
  });

  it('restores the dive close control after a nested pause closes', () => {
    const fixture = createFixture();
    const dive = fixture.modals.get('dive-result')!;
    const pause = fixture.modals.get('pause')!;

    fixture.manager.activate(dive);
    fixture.manager.activate(pause);
    expect(document.activeElement).toBe(fixture.targets.get('pause'));

    fixture.manager.deactivate(pause);

    expect(fixture.manager.topmostModal()).toBe(dive);
    expect(document.activeElement).toBe(fixture.targets.get('dive-result'));
    expect(dive.hasAttribute('inert')).toBe(false);
  });

  it('wraps both Tab boundaries with the exact control selector and filters', () => {
    const modal = document.createElement('section');
    const initial = document.createElement('h2');
    initial.tabIndex = -1;
    const hiddenParent = document.createElement('div');
    hiddenParent.hidden = true;
    const hidden = document.createElement('button');
    hiddenParent.append(hidden);
    const disabled = document.createElement('button');
    disabled.disabled = true;
    const negativeTabIndex = document.createElement('button');
    negativeTabIndex.tabIndex = -1;
    const first = document.createElement('button');
    first.setAttribute('aria-disabled', 'true');
    const inert = document.createElement('button');
    inert.setAttribute('inert', '');
    const ariaHidden = document.createElement('button');
    ariaHidden.setAttribute('aria-hidden', 'true');
    const last = document.createElement('a');
    last.href = '#last';
    modal.append(
      initial,
      hiddenParent,
      disabled,
      first,
      negativeTabIndex,
      inert,
      ariaHidden,
      last,
    );
    document.body.append(modal);
    const manager = new ModalFocusManager(
      [],
      [modal],
      new Map([[modal, initial]]),
    );
    manager.activate(modal);

    last.focus();
    const forward = keydown();
    expect(manager.handleKeyDown(forward)).toBe(true);
    expect(forward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);

    const backward = keydown(true);
    expect(manager.handleKeyDown(backward)).toBe(true);
    expect(backward.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);

    negativeTabIndex.focus();
    expect(manager.handleKeyDown(keydown())).toBe(false);
    expect(document.activeElement).toBe(negativeTabIndex);

    for (const filtered of [hidden, inert, ariaHidden]) {
      filtered.focus();
      const event = keydown();
      expect(manager.handleKeyDown(event)).toBe(true);
      expect(document.activeElement).toBe(first);
    }
  });

  it('keeps focus on the explicit target when a modal has zero controls', () => {
    const modal = document.createElement('section');
    const heading = document.createElement('h2');
    heading.tabIndex = -1;
    modal.append(heading);
    document.body.append(modal);
    const manager = new ModalFocusManager([], [modal], new Map([[modal, heading]]));
    manager.activate(modal);
    document.body.tabIndex = -1;
    document.body.focus();

    const event = keydown();
    expect(manager.handleKeyDown(event)).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(heading);
  });

  it('keeps the first origin across repeated activation and restores it once', () => {
    const fixture = createFixture();
    const journal = fixture.modals.get('journal')!;
    const firstOrigin = document.createElement('button');
    const laterOrigin = document.createElement('button');
    document.body.prepend(firstOrigin, laterOrigin);

    fixture.manager.activate(journal, firstOrigin);
    fixture.manager.activate(journal, laterOrigin);
    fixture.manager.deactivate(journal);
    expect(document.activeElement).toBe(firstOrigin);

    laterOrigin.focus();
    fixture.manager.deactivate(journal);
    expect(document.activeElement).toBe(laterOrigin);
  });

  it('preserves valid interior focus during repeated topmost activation', () => {
    const fixture = createFixture();
    const journal = fixture.modals.get('journal')!;
    const initial = fixture.targets.get('journal')!;
    const interior = document.createElement('button');
    journal.append(interior);
    const initialFocus = vi.spyOn(initial, 'focus');
    fixture.manager.activate(journal);
    initialFocus.mockClear();
    interior.focus();

    fixture.manager.activate(journal);

    expect(initialFocus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(interior);
  });

  it('deactivates a result without focusing its origin or the exposed modal', () => {
    const fixture = createFixture();
    const fishing = fixture.modals.get('fishing-layer')!;
    const result = fixture.modals.get('fishing-result')!;
    const origin = document.createElement('button');
    document.body.prepend(origin);
    origin.focus();
    fixture.manager.activate(fishing);
    const exposedFocus = vi.spyOn(fixture.targets.get('fishing-layer')!, 'focus');
    fixture.manager.activate(result, origin);
    exposedFocus.mockClear();

    fixture.manager.deactivate(result, false);

    expect(exposedFocus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(fixture.targets.get('fishing-result'));
    expect(result.classList.contains('is-visible')).toBe(false);
    expect(fixture.manager.topmostModal()).toBe(fishing);
    expect(fixture.topControls.hasAttribute('inert')).toBe(true);
  });

  it('does not restore on double disposal and stays inert after disposal', () => {
    const fixture = createFixture();
    const journal = fixture.modals.get('journal')!;
    const fishing = fixture.modals.get('fishing-layer')!;
    const origin = document.createElement('button');
    document.body.prepend(origin);
    origin.focus();
    fixture.manager.activate(journal, origin);
    const restoreFocus = vi.spyOn(origin, 'focus');

    fixture.manager.dispose();
    fixture.manager.dispose();
    fixture.manager.deactivate(journal);
    fixture.manager.activate(fishing);
    fixture.manager.sync();

    expect(restoreFocus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(fixture.targets.get('journal'));
    expect(journal.classList.contains('is-visible')).toBe(true);
    expect(fishing.classList.contains('is-visible')).toBe(false);
    expect(fixture.topControls.hasAttribute('inert')).toBe(true);
    expect(fixture.manager.topmostModal()).toBeNull();
    expect(fixture.manager.handleKeyDown(keydown())).toBe(false);
  });
});
