import { AnimationAction, AnimationClip, AnimationMixer, Group } from 'three';
import { createMenuMotionSample, sampleMenuMotionInto } from './menuChoreography';

export interface MenuSharkActor {
  readonly root: Group;
  readonly clip: AnimationClip;
}

export interface UnderwaterMenuActors {
  readonly sharks: readonly [MenuSharkActor, MenuSharkActor];
  readonly fishSchools: readonly [Group, Group];
  readonly setPlantTime: (time: number) => void;
  readonly setBubbleTime: (time: number) => void;
  readonly setMatterTime: (time: number) => void;
  readonly setCausticStrength: (strength: number) => void;
}

export class UnderwaterMenuAnimator {
  private readonly sample = createMenuMotionSample();
  private readonly mixers: readonly [AnimationMixer, AnimationMixer];
  private readonly actions: readonly [AnimationAction, AnimationAction];
  private disposed = false;

  constructor(private readonly actors: UnderwaterMenuActors) {
    if (actors.sharks[0].clip.name !== 'Armature|Swim'
      || actors.sharks[1].clip.name !== 'Armature|Swim') {
      throw new Error('Menu sharks require the Armature|Swim clip');
    }

    const firstMixer = new AnimationMixer(actors.sharks[0].root);
    const secondMixer = new AnimationMixer(actors.sharks[1].root);
    const firstAction = firstMixer.clipAction(actors.sharks[0].clip);
    const secondAction = secondMixer.clipAction(actors.sharks[1].clip);
    firstAction.play();
    secondAction.play();
    secondAction.time = actors.sharks[1].clip.duration * 0.5;
    this.mixers = [firstMixer, secondMixer];
    this.actions = [firstAction, secondAction];
  }

  update(elapsedSeconds: number, deltaSeconds: number): void {
    if (this.disposed) return;

    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    this.mixers[0].update(delta);
    this.mixers[1].update(delta);
    sampleMenuMotionInto(
      this.sample,
      Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0,
    );

    for (let index = 0; index < 2; index += 1) {
      const sharkPose = this.sample.sharks[index]!;
      const shark = this.actors.sharks[index]!.root;
      shark.position.set(
        sharkPose.position[0],
        sharkPose.position[1],
        sharkPose.position[2],
      );
      shark.rotation.y = Math.atan2(sharkPose.tangent[0], sharkPose.tangent[2]);

      const fishPose = this.sample.fishSchools[index]!;
      const fishSchool = this.actors.fishSchools[index]!;
      fishSchool.position.set(
        fishPose.position[0],
        fishPose.position[1],
        fishPose.position[2],
      );
      fishSchool.rotation.y = Math.atan2(fishPose.tangent[0], fishPose.tangent[2]);
    }

    this.actors.setPlantTime(this.sample.plantTime);
    this.actors.setBubbleTime(this.sample.bubbleTime);
    this.actors.setMatterTime(this.sample.matterTime);
    this.actors.setCausticStrength(this.sample.causticStrength);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (let index = 0; index < 2; index += 1) {
      this.actions[index]!.stop();
      this.mixers[index]!.uncacheRoot(this.actors.sharks[index]!.root);
    }
  }
}
