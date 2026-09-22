import type { SurvivalUI } from '../ui/SurvivalUI';
import type { FocusedEventChoiceSelection, FocusedEventChoiceView } from '../ui/SurvivalUiViewModel';
import type { BoatWorld } from './BoatWorld';
import type { InspectableEventId } from './eventCatalog';

export type FocusedEventWorldPort = Pick<BoatWorld, 'projectEventInteractionBounds'>;
export type FocusedEventUiPort = Pick<SurvivalUI,
  'setEventSelection' | 'showFocusedEvent' | 'hideFocusedEvent' | 'updateFocusedEventTarget'>;

export class FocusedEventView {
  private eventId: InspectableEventId | null = null;
  private choices: readonly FocusedEventChoiceView[] = [];
  private width = 1;
  private height = 1;
  constructor(private readonly world: FocusedEventWorldPort, private readonly ui: FocusedEventUiPort) {}

  show(eventId: InspectableEventId, choices: readonly FocusedEventChoiceView[]): void {
    this.eventId = eventId;
    this.choices = choices;
    this.ui.setEventSelection(new Map(), []);
    this.ui.showFocusedEvent({ eventId, choices,
      target: this.world.projectEventInteractionBounds(eventId, this.width, this.height) });
  }

  hide(): void {
    if (this.eventId === null) return;
    this.eventId = null;
    this.choices = [];
    this.ui.hideFocusedEvent();
  }

  resize(width: number, height: number): void {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return;
    this.width = width;
    this.height = height;
    if (this.eventId === null) return;
    this.ui.updateFocusedEventTarget(this.world.projectEventInteractionBounds(this.eventId, width, height));
  }

  accepts(choice: FocusedEventChoiceSelection): boolean {
    return this.eventId !== null && this.choices.some((current) =>
      current.id === choice.id && current.instanceId === choice.instanceId);
  }
}
