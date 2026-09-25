import { settingsText, refreshSettingsText } from '../i18n/settingsMessages';
import {
  REACTION_PREVIEW_EVENTS, reactionPreviewSetup, type EventReactionPreviewRequest,
} from '../survival/EventReactionPreview';
import type { SurvivalEventId } from '../survival/eventCatalog';

export class EventReactionControls {
  readonly element = document.createElement('section');
  private readonly event: HTMLSelectElement;
  private readonly choice: HTMLSelectElement;
  private readonly result: HTMLSelectElement;
  private readonly description: HTMLElement;
  private busy = false;
  private disposed = false;

  constructor(private readonly play: (request: EventReactionPreviewRequest) => Promise<void>) {
    this.element.className = 'post-processing-console__category post-processing-console__reactions';
    this.element.innerHTML = `
      <h2 data-settings-copy="eventReactions"></h2>
      <label class="post-processing-console__reaction-field"><span data-settings-copy="event"></span><select data-reaction-event></select></label>
      <label class="post-processing-console__reaction-field"><span data-settings-copy="reactionChoice"></span><select data-reaction-choice></select></label>
      <label class="post-processing-console__reaction-field"><span data-settings-copy="reactionResult"></span><select data-reaction-result></select></label>
      <p class="post-processing-console__reaction-description" data-reaction-description></p>
      <div class="post-processing-console__reaction-actions">
        <button type="button" data-reaction-play="reaction" data-settings-copy="playReaction"></button>
        <button type="button" data-reaction-play="sequence" data-settings-copy="playSequence"></button>
      </div>
      <p class="post-processing-console__reaction-status" data-reaction-status role="status" data-settings-copy="reactionPreviewNote"></p>`;
    this.event = this.element.querySelector('[data-reaction-event]')!;
    this.choice = this.element.querySelector('[data-reaction-choice]')!;
    this.result = this.element.querySelector('[data-reaction-result]')!;
    this.description = this.element.querySelector('[data-reaction-description]')!;
    this.event.onchange = () => this.updateChoices();
    this.choice.onchange = () => this.updateResults();
    this.result.onchange = () => this.updateDescription();
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-reaction-play]')) {
      button.onclick = () => { void this.run(button.dataset.reactionPlay as EventReactionPreviewRequest['mode']); };
    }
    this.refreshLanguage();
    this.event.value = 'monster-in-the-fog';
    this.updateChoices('flashlight');
    if (this.result.options.length > 1) this.result.selectedIndex = 1;
    this.updateDescription();
  }

  refreshLanguage(): void {
    const event = this.event.value;
    const choice = this.choice.value;
    const result = this.result.value;
    refreshSettingsText(this.element);
    this.event.replaceChildren(...REACTION_PREVIEW_EVENTS.map(event => this.option(event.id, event.title)));
    if (event) this.event.value = event;
    this.updateChoices(choice, result);
  }

  dispose(): void { this.disposed = true; this.element.remove(); }

  private option(value: string, label: string, disabled = false): HTMLOptionElement {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    option.disabled = disabled;
    return option;
  }

  private updateChoices(selected?: string, result?: string): void {
    const { choices } = reactionPreviewSetup(this.event.value);
    this.choice.replaceChildren(...choices.map(({ choice, failures }) => this.option(
      choice.id, choice.label, failures.length > 0,
    )));
    this.choice.value = choices.find(d => d.choice.id === selected && d.failures.length === 0)?.choice.id
      ?? choices.find(d => d.failures.length === 0)?.choice.id ?? '';
    this.updateResults(result);
  }

  private updateResults(selected?: string): void {
    const decision = reactionPreviewSetup(this.event.value).choices.find(d => d.choice.id === this.choice.value);
    const outcomes = decision?.choice.outcomes ?? [];
    this.result.replaceChildren(...outcomes.map((outcome, index) => this.option(
      outcome.resultId!, `${index + 1}. ${outcome.message}`,
    )));
    if (outcomes.some(outcome => outcome.resultId === selected)) this.result.value = selected!;
    this.updateDescription();
    this.setDisabled(this.busy);
  }

  private updateDescription(): void {
    this.description.textContent = this.result.selectedOptions[0]?.textContent?.replace(/^\d+\. /, '') ?? '';
  }

  private setDisabled(busy: boolean): void {
    for (const select of [this.event, this.choice, this.result]) select.disabled = busy;
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('button')) {
      button.disabled = busy || this.result.value === '';
    }
  }

  private async run(mode: EventReactionPreviewRequest['mode']): Promise<void> {
    if (this.busy || this.disposed || this.result.value === '') return;
    this.busy = true;
    this.setDisabled(true);
    const status = this.element.querySelector<HTMLElement>('[data-reaction-status]')!;
    status.textContent = settingsText('reactionPlaying');
    try {
      await this.play({ eventId: this.event.value as SurvivalEventId,
        choiceId: this.choice.value, resultId: this.result.value, mode });
      if (!this.disposed) status.textContent = settingsText('reactionReady');
    } catch (error) {
      if (!this.disposed) status.textContent = `${settingsText('reactionFailed')} ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      this.busy = false;
      if (!this.disposed) this.setDisabled(false);
    }
  }
}
