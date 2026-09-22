import { ChestAttackPresentation } from './ChestAttackPresentation';
import { HandymanPresentation } from './HandymanPresentation';
import { MidnightTourPresentation } from './MidnightTourPresentation';
import { NightTraderPresentation } from './NightTraderPresentation';
import { OtherPeoplePresentation } from './OtherPeoplePresentation';
import { GhostShipPresentation } from './GhostShipPresentation';
import { PlanePresentation } from './PlanePresentation';
import { FlyingSaucerPresentation } from './FlyingSaucerPresentation';
import { LighthousePresentation } from './LighthousePresentation';
import type { FocusedEventPresentationFactories } from './FocusedEventPresentation';

export const AUTHORED_EVENT_PRESENTATION_FACTORIES: FocusedEventPresentationFactories = {
  'chest-attack': (dependencies) => new ChestAttackPresentation(dependencies),
  'midnight-tour': (dependencies) => new MidnightTourPresentation(dependencies),
  'night-trader': (dependencies) => new NightTraderPresentation(dependencies),
  handyman: (dependencies) => new HandymanPresentation(dependencies),
  'other-people': (dependencies) => new OtherPeoplePresentation(dependencies),
  'ghost-ship': (dependencies) => new GhostShipPresentation(dependencies),
  plane: (dependencies) => new PlanePresentation(dependencies),
  'flying-saucer': (dependencies) => new FlyingSaucerPresentation(dependencies),
  lighthouse: (dependencies) => new LighthousePresentation(dependencies),
};
