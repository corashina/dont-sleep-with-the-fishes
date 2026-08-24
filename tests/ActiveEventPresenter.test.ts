// Importance: 8/10. Protects selected event construction, attachment, and exact resource cleanup.
import { Group, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ActiveEventPresenter } from '../src/survival/ActiveEventPresenter';
import { FeaturedEventPresentations } from '../src/survival/FeaturedEventPresentations';
import type { SurvivalEventModels } from '../src/survival/SurvivalEventModelLibrary';

describe('ActiveEventPresenter', () => {
  it('attaches and disposes owned parts once', () => {
    const parent = new Group();
    const root = new Group();
    const dispose = vi.fn();
    const presenter = new ActiveEventPresenter('flowers', {
      dedicated: null,
      layer: null,
      featured: { dispose } as never,
      weather: null,
      supernatural: null,
      roots: [{ parent, root }],
    });

    presenter.attach();
    presenter.attach();
    expect(parent.children).toEqual([root]);

    presenter.dispose();
    presenter.dispose();
    expect(root.parent).toBeNull();
    expect(dispose).toHaveBeenCalledOnce();
  });

  it('constructs only the requested featured event', () => {
    const clone = vi.fn((id: Parameters<SurvivalEventModels['clone']>[0]) => {
      const root = new Group();
      root.name = id;
      return root;
    });
    const presentations = new FeaturedEventPresentations(
      { clone },
      new PerspectiveCamera(),
      new Group(),
      new Group(),
      new Group(),
      () => undefined,
      'flowers',
    );

    expect(clone).toHaveBeenCalled();
    expect(new Set(clone.mock.calls.map(([id]) => id))).toEqual(new Set(['flowers']));

    presentations.dispose();
  });
});
