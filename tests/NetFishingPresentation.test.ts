import { Group } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { NetFishingPresentation } from '../src/survival/NetFishingPresentation';

describe('net animation', () => {
  it('cues one splash at water contact, including skipped frames, and clears pending cues', async () => {
    const scene = new Group();
    const net = new NetFishingPresentation(new Group(), scene, scene, (output) => { output.height = 0; }, {
      prepare: vi.fn(async () => null), hide: vi.fn(), dispose: vi.fn(),
    });
    const impact = vi.fn();
    const point = { x: 0, z: -6.4 };
    try {
      net.show();
      await net.prepare('cod', point, impact);
      net.sample(0.239);
      expect(impact).not.toHaveBeenCalled();
      net.sample(0.24);
      expect(impact).toHaveBeenCalledOnce();
      net.sample(0.5);
      net.sample(1);
      expect(impact).toHaveBeenCalledOnce();
      await net.prepare('cod', point, impact);
      net.sample(1);
      expect(impact).toHaveBeenCalledTimes(2);
      await net.prepare('cod', point, impact);
      net.clear();
      net.sample(0.5);
      expect(impact).toHaveBeenCalledTimes(2);
    } finally {
      net.dispose();
    }
  });

  it('discards catches whose loading finishes after the view closes', async () => {
    const scene = new Group();
    let finish!: (model: Group) => void;
    const pending = new Promise<Group>((resolve) => { finish = resolve; });
    const prepare = vi.fn().mockReturnValue(pending);
    const net = new NetFishingPresentation(new Group(), scene, scene, (output) => { output.height = 0; }, {
      prepare, hide: vi.fn(), dispose: vi.fn(),
    });
    try {
      net.show();
      const load = net.prepare('cod', { x: 0, z: -6.4 });
      net.clear();
      finish(new Group());
      expect(await load).toBe(false);
      expect(net.root.visible).toBe(false);
    } finally {
      net.dispose();
    }
  });

});
