// @vitest-environment jsdom

import { PerspectiveCamera, Quaternion } from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { SurvivalCameraLook } from '../src/survival/SurvivalCameraLook';

const controllers: SurvivalCameraLook[] = [];

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.dispose());
});

function pointer(
  type: string,
  options: PointerEventInit & { movementX?: number; movementY?: number },
): PointerEvent {
  const event = new PointerEvent(type, options);
  Object.defineProperties(event, {
    movementX: { value: options.movementX ?? 0 },
    movementY: { value: options.movementY ?? 0 },
  });
  return event;
}

describe('SurvivalCameraLook', () => {
  it('looks around only while the right pointer button is held', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const camera = new PerspectiveCamera();
    const controller = new SurvivalCameraLook(mount, camera);
    controllers.push(controller);

    mount.dispatchEvent(pointer('pointerdown', { button: 0, pointerId: 1 }));
    window.dispatchEvent(pointer('pointermove', {
      pointerId: 1,
      movementX: 80,
      movementY: 30,
    }));
    controller.update(1 / 60);
    expect(camera.quaternion.equals(new Quaternion())).toBe(true);

    mount.dispatchEvent(pointer('pointerdown', { button: 2, pointerId: 2 }));
    window.dispatchEvent(pointer('pointermove', {
      pointerId: 2,
      movementX: 80,
      movementY: 30,
    }));
    controller.update(1 / 60);
    expect(camera.quaternion.equals(new Quaternion())).toBe(false);

    mount.remove();
  });

  it('smoothly settles back to each frame authored camera pose after release', () => {
    const mount = document.createElement('main');
    document.body.append(mount);
    const camera = new PerspectiveCamera();
    const controller = new SurvivalCameraLook(mount, camera);
    controllers.push(controller);
    const authored = new Quaternion().setFromAxisAngle(camera.up, 0.2);

    mount.dispatchEvent(pointer('pointerdown', { button: 2, pointerId: 4 }));
    window.dispatchEvent(pointer('pointermove', {
      pointerId: 4,
      movementX: 120,
      movementY: -40,
    }));
    camera.quaternion.copy(authored);
    controller.update(1 / 60);
    const looked = camera.quaternion.clone();
    expect(looked.equals(authored)).toBe(false);

    window.dispatchEvent(pointer('pointerup', { button: 2, pointerId: 4 }));
    camera.quaternion.copy(authored);
    controller.update(1 / 60);
    expect(camera.quaternion.angleTo(authored)).toBeLessThan(looked.angleTo(authored));
    expect(camera.quaternion.equals(authored)).toBe(false);

    for (let index = 0; index < 120; index += 1) {
      camera.quaternion.copy(authored);
      controller.update(1 / 60);
    }
    expect(camera.quaternion.angleTo(authored)).toBeLessThan(0.0003);

    mount.remove();
  });

  it('suppresses the survival context menu and removes listeners on dispose', () => {
    const mount = document.createElement('main');
    const camera = new PerspectiveCamera();
    const controller = new SurvivalCameraLook(mount, camera);
    controllers.push(controller);
    const during = new MouseEvent('contextmenu', { cancelable: true });
    mount.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);

    controller.dispose();
    const after = new MouseEvent('contextmenu', { cancelable: true });
    mount.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});
