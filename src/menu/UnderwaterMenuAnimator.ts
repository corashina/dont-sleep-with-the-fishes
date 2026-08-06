import { AnimationAction, AnimationClip, AnimationMixer, Group } from 'three';
import { createMenuMotionSample, sampleMenuMotionInto } from './menuChoreography';

export interface MenuSharkActor {
  readonly root: Group;
  readonly clip: AnimationClip;
}

export interface MenuFishActor {
  readonly root: Group;
  readonly clip: AnimationClip;
}

export interface UnderwaterMenuActors {
  readonly sharks: readonly [MenuSharkActor, MenuSharkActor];
  readonly fishSchools: readonly [Group, Group];
  readonly fish: readonly MenuFishActor[];
  readonly setPlantTime: (time: number) => void;
  readonly setBubbleTime: (time: number) => void;
  readonly setMatterTime: (time: number) => void;
  readonly setCausticStrength: (strength: number) => void;
}

export class UnderwaterMenuAnimator {
  private readonly sample = createMenuMotionSample();
  private readonly mixers: readonly AnimationMixer[];
  private readonly actions: readonly AnimationAction[];
  private readonly animatedActors: readonly MenuSharkActor[];
  private disposed = false;

  constructor(private readonly actors: UnderwaterMenuActors) {
    const animatedActors = [...actors.sharks, ...actors.fish];
    if (animatedActors.some(({ clip }) => clip.name !== 'Armature|Swim')) {
      throw new Error('Menu swimmers require the Armature|Swim clip');
    }

    this.animatedActors = animatedActors;
    this.mixers = animatedActors.map(({ root }) => new AnimationMixer(root));
    this.actions = animatedActors.map(({ clip }, index) => {
      const action = this.mixers[index]!.clipAction(clip);
      action.play();
      action.time = clip.duration * (index / animatedActors.length);
      return action;
    });
  }

  update(elapsedSeconds: number, deltaSeconds: number): void {
    if (this.disposed) return;

    const delta = Number.isFinite(deltaSeconds) ? Math.max(0, deltaSeconds) : 0;
    for (const mixer of this.mixers) mixer.update(delta);
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
    for (let index = 0; index < this.animatedActors.length; index += 1) {
      this.actions[index]!.stop();
      this.mixers[index]!.uncacheRoot(this.animatedActors[index]!.root);
    }
  }
}
