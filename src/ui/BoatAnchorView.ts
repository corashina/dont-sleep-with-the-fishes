import {
  ITEM_LABELS,
  type ItemInstanceId,
} from '../game/ItemState';
import type { BoatInteractionAnchor, BoatToolId } from '../survival/BoatInteraction';
import { carlitosStatus } from '../survival/CarlitosState';
import type { InspectableEventId } from '../survival/eventCatalog';
import { SURVIVAL_ITEM_DESCRIPTIONS } from '../survival/itemDescriptions';
import { repairEnergyCost, SURVIVAL_BALANCE } from '../survival/survivalBalance';
import type {
  DayActionId,
  EventResponseId,
} from '../survival/survivalTypes';
import type { SurvivalSnapshot } from '../survival/survivalSnapshot';
import { createElementRequirement } from './dom';
import type { EventContextChoice } from './SurvivalUiViewModel';
import { uiArtwork } from './uiArtwork';

interface ActionDefinition {
  readonly id: DayActionId;
  readonly label: string;
  readonly cost: string;
  readonly energyCost: number;
  readonly effect: string;
  readonly risk: 'safe' | 'uncertain' | 'dangerous';
}

interface ActionPreview {
  readonly cost: string;
  readonly energyCost: number;
  readonly effect: string;
  readonly risk: ActionDefinition['risk'];
}

interface BoatToolCopy {
  readonly label: string;
  readonly description: string;
}

const BOAT_TOOL_COPY: Readonly<Record<BoatToolId, BoatToolCopy>> = Object.freeze({
  repairTools: {
    label: 'REPAIR',
    description: 'Use the open repair toolbox to repair the lifeboat.',
  },
  fishingRod: {
    label: 'FISH',
    description: 'Cast from the bow to find food or drifting junk. Bait is used automatically when available.',
  },
  pillow: {
    label: 'END DAY',
    description: 'Rest on the pillow to end the current day. Energy is restored at dawn.',
  },
  chest: {
    label: 'CHEST',
    description: 'Open the recovered chest. The task costs three energy.',
  },
});

const ACTIONS: readonly ActionDefinition[] = [
  { id: 'fish', label: 'FISH', cost: '1 ENERGY', energyCost: SURVIVAL_BALANCE.actions.fishEnergy, effect: 'Chance to gain food', risk: 'uncertain' },
  { id: 'dive', label: 'DIVE', cost: '3 ENERGY', energyCost: SURVIVAL_BALANCE.actions.diveEnergy, effect: 'May recover supplies; injury risk', risk: 'dangerous' },
  { id: 'eat', label: 'EAT', cost: '1 FOOD', energyCost: 0, effect: 'HUNGER -35', risk: 'safe' },
  { id: 'repair', label: 'REPAIR', cost: '1 ENERGY + MATERIAL', energyCost: SURVIVAL_BALANCE.actions.repairEnergy, effect: 'HULL +25 (tape +15)', risk: 'safe' },
  { id: 'treat', label: 'TREAT', cost: '1 MEDKIT', energyCost: 0, effect: 'HEALTH +30', risk: 'safe' },
  { id: 'endDay', label: 'END DAY', cost: 'REST', energyCost: 0, effect: 'RESTORE ENERGY AT DAWN', risk: 'safe' },
  { id: 'repairItem', label: 'REPAIR ITEM', cost: '1 DUCT TAPE', energyCost: 0, effect: 'Restore one broken item', risk: 'safe' },
  { id: 'answerRadio', label: 'ANSWER RADIO', cost: '1 ENERGY', energyCost: SURVIVAL_BALANCE.radio.energy, effect: 'IMPROVE RESCUE LEAD', risk: 'safe' },
  { id: 'useEnergyBar', label: 'EAT ENERGY BAR', cost: '1 ENERGY BAR', energyCost: 0, effect: 'ENERGY TO 3', risk: 'safe' },
  { id: 'openChest', label: 'OPEN CHEST', cost: '3 ENERGY', energyCost: 3, effect: 'RECOVER A SUPPLY', risk: 'uncertain' },
  { id: 'petCarlitos', label: 'PET', cost: 'FREE', energyCost: 0, effect: 'EASE LONELINESS', risk: 'safe' },
  { id: 'feedCarlitos', label: 'FEED', cost: '1 FOOD', energyCost: 0, effect: 'RESTORE HUNGER', risk: 'safe' },
  { id: 'treatCarlitos', label: 'TREAT', cost: '1 MEDKIT', energyCost: 0, effect: 'CURE SICKNESS', risk: 'safe' },
];

const CARLITOS_ACTIONS = [
  'petCarlitos',
  'feedCarlitos',
  'treatCarlitos',
] as const satisfies readonly DayActionId[];

const ENERGY_WORDS = ['', 'one', 'two', 'three'] as const;

function spokenEnergyCost(cost: number): string | null {
  if (cost <= 0) return null;
  return `${ENERGY_WORDS[cost] ?? String(cost)} energy`;
}

function quantityLabel(label: string, quantity: number): string {
  return quantity > 1 ? `${label} ×${quantity}` : label;
}

function actionPreview(definition: ActionDefinition, snapshot: SurvivalSnapshot): ActionPreview {
  const missingHull = Math.max(0, 100 - snapshot.hull);
  switch (definition.id) {
    case 'eat': return { ...definition, effect: `HUNGER -${Math.min(35, snapshot.hunger)}` };
    case 'treat': return { ...definition, effect: `HEALTH +${Math.min(30, Math.max(0, 100 - snapshot.health))}` };
    case 'repair': {
      const energyCost = repairEnergyCost(snapshot.hull);
      const useTape = snapshot.repairMaterial < 1
        && Object.values(snapshot.inventory).some(
          (item) => item?.type === 'ductTape' && item.condition === 'usable',
        );
      return {
        ...definition,
        cost: `${energyCost} ENERGY + ${useTape ? 'TAPE' : 'MATERIAL'}`,
        energyCost,
        effect: `HULL +${Math.min(useTape ? 15 : 25, missingHull)}`,
      };
    }
    default: return definition;
  }
}

type AnchorInteractionState =
  | 'ordinary'
  | 'eventLocked'
  | 'eventAvailable'
  | 'eventUnavailable'
  | 'selected';

interface AnchorTooltipNodes {
  readonly tooltip: HTMLElement;
  readonly label: Text;
  readonly separator: Text;
  readonly energy: HTMLElement;
}

interface AnchorLayoutState {
  readonly visible: boolean;
  readonly x: number;
  readonly y: number;
  readonly targetKind: 'item' | 'tool' | 'event';
  readonly width: number;
  readonly height: number;
  readonly zIndex: number;
  readonly depleted: boolean;
}

const DEFAULT_ANCHOR_HIT_AREA = Object.freeze({
  width: 54,
  height: 54,
  depth: 0,
});

const requireElement = createElementRequirement('boat anchor view');

export class BoatAnchorView {
  readonly anchorLayer: HTMLElement;
  readonly carlitosCard: HTMLElement;
  readonly roots: readonly [HTMLElement, HTMLElement];

  onAction: (action: DayActionId, origin: HTMLButtonElement) => void = () => undefined;
  onUnavailableAction: (action: DayActionId, reason: string) => void = () => undefined;
  onEventItem: (choiceId: EventResponseId, instanceId: ItemInstanceId) => void = () => undefined;
  onEventChoice: (choiceId: EventResponseId) => void = () => undefined;
  onEventFocus: (eventId: InspectableEventId) => void = () => undefined;
  onHighlight: (anchorId: string | null) => void = () => undefined;

  private readonly carlitosPet: HTMLButtonElement;
  private readonly carlitosHungerLabel: HTMLElement;
  private readonly carlitosHappiness: HTMLElement;
  private readonly carlitosHealth: HTMLElement;
  private readonly carlitosEnergyLabel: HTMLElement;
  private readonly carlitosRows: Readonly<Record<'hunger' | 'happiness' | 'health', HTMLElement>>;
  private readonly carlitosActions = new Map<DayActionId, HTMLButtonElement>();
  private readonly anchorButtons = new Map<string, HTMLButtonElement>();
  private readonly anchorTooltipNodes = new WeakMap<HTMLButtonElement, AnchorTooltipNodes>();
  private readonly anchors = new Map<string, BoatInteractionAnchor>();
  private readonly anchorLayouts = new Map<string, AnchorLayoutState>();
  private actionReasons: ReadonlyMap<DayActionId, string | null> = new Map();
  private currentSnapshot: SurvivalSnapshot | null = null;
  private eventEligibility: ReadonlyMap<ItemInstanceId, EventResponseId> | null = null;
  private contextualEventChoices: readonly EventContextChoice[] = [];
  private eventSelectedInstanceId: ItemInstanceId | null = null;
  private eventSelectedChoiceId: EventResponseId | null = null;
  private eventPresentationActive = false;
  private itemAnimationLab = false;
  private hoveredAnchorId: string | null = null;
  private focusedAnchorId: string | null = null;
  private publishedAnchorId: string | null = null;
  private cycledAnchorId: string | null = null;
  private carlitosReturnTarget: HTMLButtonElement | null = null;
  private busy = false;
  private paused = false;
  private modalOpen = false;
  private disposed = false;

  constructor(private readonly host: HTMLElement) {
    const template = document.createElement('template');
    template.innerHTML = `
      <div class="boat-anchors" data-boat-anchors aria-label="Boat interaction points"></div>
      <section class="carlitos-card scuba-popup-paper" data-carlitos-card aria-label="Cat status" aria-hidden="true" hidden>
        <button type="button" class="carlitos-card__close ui-role-context" data-carlitos-close aria-label="Close cat status">&times;</button>
        <div class="carlitos-card__statuses">
          <div class="carlitos-status" data-carlitos-energy-row>
            <span class="carlitos-status__icon carlitos-status__icon--energy" aria-hidden="true">${uiArtwork('energy')}</span>
            <strong class="ui-role-numeral" data-carlitos-energy-label></strong>
          </div>
          <div class="carlitos-status" data-carlitos-hunger-row>
            <span class="carlitos-status__icon carlitos-status__icon--hunger" aria-hidden="true">${uiArtwork('hunger')}</span>
            <strong class="ui-role-context" data-carlitos-hunger-label></strong>
            <button type="button" class="carlitos-status__action ui-role-context" data-action="feedCarlitos" aria-disabled="false">
              <span>FEED</span>
            </button>
          </div>
          <div class="carlitos-status" data-carlitos-happiness-row>
            <span class="carlitos-status__icon carlitos-status__icon--mood" aria-hidden="true">${uiArtwork('mood')}</span>
            <strong class="ui-role-context" data-carlitos-happiness></strong>
            <button type="button" class="carlitos-status__action ui-role-context" data-action="petCarlitos" aria-disabled="false">
              <span>PET</span>
            </button>
          </div>
          <div class="carlitos-status" data-carlitos-health-row>
            <span class="carlitos-status__icon carlitos-status__icon--health" aria-hidden="true">${uiArtwork('health')}</span>
            <strong class="ui-role-context" data-carlitos-health></strong>
            <button type="button" class="carlitos-status__action ui-role-context" data-action="treatCarlitos" aria-disabled="false">
              <span>TREAT</span>
            </button>
          </div>
        </div>
      </section>`;
    const roots = [...template.content.children];
    this.anchorLayer = roots[0] as HTMLElement;
    this.carlitosCard = roots[1] as HTMLElement;
    this.roots = [this.anchorLayer, this.carlitosCard];
    this.carlitosPet = requireElement(this.carlitosCard, '[data-action="petCarlitos"]');
    this.carlitosHungerLabel = requireElement(this.carlitosCard, '[data-carlitos-hunger-label]');
    this.carlitosHappiness = requireElement(this.carlitosCard, '[data-carlitos-happiness]');
    this.carlitosHealth = requireElement(this.carlitosCard, '[data-carlitos-health]');
    this.carlitosEnergyLabel = requireElement(this.carlitosCard, '[data-carlitos-energy-label]');
    this.carlitosRows = {
      hunger: requireElement(this.carlitosCard, '[data-carlitos-hunger-row]'),
      happiness: requireElement(this.carlitosCard, '[data-carlitos-happiness-row]'),
      health: requireElement(this.carlitosCard, '[data-carlitos-health-row]'),
    };
    CARLITOS_ACTIONS.forEach((action) => {
      this.carlitosActions.set(
        action,
        requireElement(this.carlitosCard, `[data-action="${action}"]`),
      );
    });
    this.anchorLayer.addEventListener('click', this.handleAnchorClick);
    this.carlitosCard.addEventListener('click', this.handleCarlitosClick);
    this.anchorLayer.addEventListener('pointerover', this.handleAnchorPointerOver);
    this.anchorLayer.addEventListener('pointerout', this.handleAnchorPointerOut);
    this.anchorLayer.addEventListener('focusin', this.handleAnchorFocusIn);
    this.anchorLayer.addEventListener('focusout', this.handleAnchorFocusOut);
    this.anchorLayer.addEventListener('wheel', this.handleAnchorWheel, { passive: false });
    document.addEventListener('click', this.handleDocumentClick);
    window.addEventListener('resize', this.handleWindowResize);
  }

  render(
    snapshot: SurvivalSnapshot,
    unavailableReasons: ReadonlyMap<DayActionId, string | null>,
  ): void {
    if (this.disposed) return;
    this.currentSnapshot = snapshot;
    this.actionReasons = unavailableReasons;
    this.renderCarlitos(snapshot);
    this.anchors.forEach((anchor, id) => {
      const button = this.anchorButtons.get(id);
      if (button !== undefined) this.refreshAnchorTooltip(button, anchor);
    });
    this.syncCommandState();
  }

  setAnchors(nextAnchors: readonly BoatInteractionAnchor[]): void {
    if (this.disposed) return;
    const seen = new Set<string>();
    let highlightInvalidated = false;
    for (const anchor of nextAnchors) {
      seen.add(anchor.id);
      if (!anchor.visible || !this.isHighlightableAnchor(anchor)) {
        highlightInvalidated = this.invalidateAnchorHighlight(anchor.id) || highlightInvalidated;
      }
      this.anchors.set(anchor.id, anchor);
      const button = this.anchorButtons.get(anchor.id) ?? this.createAnchorButton(anchor);
      if (anchor.eventFocusId === undefined) delete button.dataset.eventFocusId;
      else button.dataset.eventFocusId = anchor.eventFocusId;
      const itemTarget = anchor.itemType !== null;
      const targetKind = itemTarget
        ? 'item'
        : anchor.eventChoiceId === undefined && anchor.eventFocusId === undefined ? 'tool' : 'event';
      const hitArea = anchor.hitArea ?? DEFAULT_ANCHOR_HIT_AREA;
      const x = Math.round(anchor.x);
      const y = Math.round(anchor.y);
      const targetWidth = Math.round(hitArea.width);
      const targetHeight = Math.round(hitArea.height);
      const zIndex = Math.max(1, 100000 - Math.round(hitArea.depth * 100));
      const previous = this.anchorLayouts.get(anchor.id);
      if (
        previous === undefined
        || previous.visible !== anchor.visible
        || previous.x !== x
        || previous.y !== y
        || previous.targetKind !== targetKind
        || previous.width !== targetWidth
        || previous.height !== targetHeight
        || previous.zIndex !== zIndex
        || previous.depleted !== anchor.depleted
      ) {
        this.anchorLayouts.set(anchor.id, {
          visible: anchor.visible,
          x,
          y,
          targetKind,
          width: targetWidth,
          height: targetHeight,
          zIndex,
          depleted: anchor.depleted,
        });
        button.hidden = !anchor.visible;
        button.style.transform = `translate(${x}px, ${y}px)`;
        button.dataset.targetKind = targetKind;
        button.style.width = `${targetWidth}px`;
        button.style.height = `${targetHeight}px`;
        button.style.marginLeft = `${-targetWidth / 2}px`;
        button.style.marginTop = `${-targetHeight / 2}px`;
        button.style.zIndex = String(zIndex);
        this.placeAnchorTooltip(button, x, y);
        button.classList.toggle('is-depleted', anchor.depleted);
      }
      this.refreshAnchorTooltip(button, anchor);
    }
    this.anchorButtons.forEach((button, id) => {
      if (seen.has(id)) return;
      highlightInvalidated = this.invalidateAnchorHighlight(id) || highlightInvalidated;
      button.remove();
      this.anchorButtons.delete(id);
      this.anchors.delete(id);
      this.anchorLayouts.delete(id);
    });
    const companionAnchor = nextAnchors.find(
      (anchor) => anchor.companionId === 'carlitos' && anchor.visible,
    );
    if (companionAnchor === undefined) this.closeCarlitosCard(false);
    else if (!this.carlitosCard.hidden) {
      this.carlitosReturnTarget = this.anchorButtons.get(companionAnchor.id) ?? null;
      this.positionCarlitosCard(companionAnchor);
    }
    if (highlightInvalidated) this.publishAnchorHighlight();
    this.syncCommandState();
  }

  setBusy(busy: boolean): void {
    if (this.disposed || this.busy === busy) return;
    this.busy = busy;
    if (busy) this.clearHighlight();
    this.syncCommandState();
  }

  setPaused(paused: boolean): void {
    if (this.disposed || this.paused === paused) return;
    if (paused) this.closeCarlitosCard(true);
    this.paused = paused;
  }

  setModalOpen(open: boolean): void {
    if (this.disposed || this.modalOpen === open) return;
    this.modalOpen = open;
  }

  beginEventPresentation(): void {
    if (this.disposed) return;
    this.closeCarlitosCard(false);
    this.clearHighlight();
    this.eventPresentationActive = true;
    this.itemAnimationLab = false;
    this.syncCommandState();
  }

  setEventPresentationActive(active: boolean): void {
    if (this.disposed) return;
    if (active) this.closeCarlitosCard(false);
    this.eventPresentationActive = active;
    if (!active) this.itemAnimationLab = false;
    this.syncCommandState();
  }

  setItemAnimationLabActive(active: boolean): void {
    if (this.disposed) return;
    this.itemAnimationLab = active;
    if (active) this.eventPresentationActive = true;
    this.anchors.forEach((anchor, id) => {
      const button = this.anchorButtons.get(id);
      if (button !== undefined) this.refreshAnchorTooltip(button, anchor);
    });
    this.syncCommandState();
  }

  setEventSelection(
    eligible: ReadonlyMap<ItemInstanceId, EventResponseId>,
    contextualChoices: readonly EventContextChoice[] = [],
  ): void {
    if (this.disposed) return;
    this.eventEligibility = new Map(eligible);
    this.contextualEventChoices = [...contextualChoices];
    this.eventSelectedInstanceId = null;
    this.eventSelectedChoiceId = null;
    this.anchors.forEach((anchor, id) => {
      const button = this.anchorButtons.get(id);
      if (button !== undefined) this.refreshAnchorTooltip(button, anchor);
    });
    this.syncCommandState();
  }

  setEventUsing(instanceId: ItemInstanceId): void {
    if (this.disposed || this.eventEligibility === null) return;
    this.eventSelectedInstanceId = instanceId;
    this.syncCommandState();
  }

  setEventChoiceSelection(choiceId: EventResponseId | null): void {
    if (this.disposed) return;
    this.eventSelectedChoiceId = choiceId;
    this.syncCommandState();
  }

  clearEventPresentation(): void {
    if (this.disposed) return;
    this.closeCarlitosCard(false);
    this.eventEligibility = null;
    this.contextualEventChoices = [];
    this.eventSelectedInstanceId = null;
    this.eventSelectedChoiceId = null;
    this.eventPresentationActive = false;
    this.itemAnimationLab = false;
    this.anchors.forEach((anchor, id) => {
      const button = this.anchorButtons.get(id);
      if (button !== undefined) this.refreshAnchorTooltip(button, anchor);
    });
    this.syncCommandState();
  }

  anchorButton(anchorId: string): HTMLButtonElement | null {
    return this.anchorButtons.get(anchorId) ?? null;
  }

  anchorButtonsInOrder(): readonly HTMLButtonElement[] {
    return [...this.anchorButtons.values()];
  }

  eventChoiceButton(choiceId: EventResponseId): HTMLButtonElement | null {
    return [...this.anchorButtons.values()]
      .find((button) => button.dataset.eventChoice === choiceId) ?? null;
  }

  anchor(anchorId: string): BoatInteractionAnchor | null {
    return this.anchors.get(anchorId) ?? null;
  }

  firstUsableCommand(): HTMLButtonElement | null {
    return [...this.anchorButtons.values()].find((button) => (
      (
        button.dataset.action !== ''
        || button.dataset.eventChoice !== undefined
        || this.eventEligibility?.has(
          button.dataset.backingInstanceId as ItemInstanceId,
        ) === true
      )
      && this.isUsableCommand(button)
    )) ?? null;
  }

  replacementButton(target: HTMLElement | null): HTMLButtonElement | null {
    const anchorId = target?.dataset.anchorId;
    return anchorId === undefined ? null : this.anchorButtons.get(anchorId) ?? null;
  }

  isCarlitosCardOpen(): boolean {
    return !this.carlitosCard.hidden;
  }

  handleCarlitosEscape(event: KeyboardEvent): boolean {
    if (event.key !== 'Escape' || this.carlitosCard.hidden) return false;
    event.preventDefault();
    this.closeCarlitosCard(true);
    return true;
  }

  handleCommandKeyDown(event: KeyboardEvent): boolean {
    const target = event.target;
    if (!(target instanceof Element) || !this.anchorLayer.contains(target)) return false;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const button = target.closest<HTMLButtonElement>('.boat-anchor');
      if (
        button !== null
        && this.cycleOverlappingAnchor(button, event.key === 'ArrowRight' ? 1 : -1)
      ) {
        event.preventDefault();
        return true;
      }
    }
    if (
      target instanceof HTMLButtonElement
      && target.dataset.companion === 'carlitos'
      && !target.hasAttribute('data-event-choice')
      && (target.dataset.eventState === undefined || this.itemAnimationLab)
      && this.isActivationKey(event.key)
    ) {
      event.preventDefault();
      this.toggleCarlitosCard(target);
      return true;
    }
    if (!this.eventPresentationActive || !this.isActivationKey(event.key)) return false;
    const choice = target.closest<HTMLButtonElement>('[data-event-choice]');
    if (choice !== null && this.anchorLayer.contains(choice)) {
      event.preventDefault();
      this.activateEventChoice(choice);
      return true;
    }
    const itemAnchor = target.closest<HTMLButtonElement>('button[data-event-state="available"]');
    const instanceId = this.instanceIdForButton(itemAnchor);
    const choiceId = instanceId === undefined ? undefined : this.eventEligibility?.get(instanceId);
    if (
      itemAnchor !== null
      && this.anchorLayer.contains(itemAnchor)
      && !itemAnchor.disabled
      && itemAnchor.getAttribute('aria-disabled') !== 'true'
      && instanceId !== undefined
      && choiceId !== undefined
      && !this.busy
      && this.eventSelectedInstanceId === null
    ) {
      event.preventDefault();
      this.onEventItem(choiceId, instanceId);
      return true;
    }
    return false;
  }

  clearHighlight(): void {
    this.hoveredAnchorId = null;
    this.focusedAnchorId = null;
    this.publishAnchorHighlight();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    let failed = false;
    let firstError: unknown;
    const clean = (cleanup: () => void): void => {
      try {
        cleanup();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    };
    clean(() => this.clearHighlight());
    clean(() => { this.carlitosCard.hidden = true; });
    clean(() => this.carlitosCard.setAttribute('aria-hidden', 'true'));
    clean(() => this.carlitosCard.classList.remove('is-visible'));
    clean(() => { this.carlitosReturnTarget = null; });
    clean(() => this.anchorLayer.removeEventListener('click', this.handleAnchorClick));
    clean(() => this.carlitosCard.removeEventListener('click', this.handleCarlitosClick));
    clean(() => this.anchorLayer.removeEventListener('pointerover', this.handleAnchorPointerOver));
    clean(() => this.anchorLayer.removeEventListener('pointerout', this.handleAnchorPointerOut));
    clean(() => this.anchorLayer.removeEventListener('focusin', this.handleAnchorFocusIn));
    clean(() => this.anchorLayer.removeEventListener('focusout', this.handleAnchorFocusOut));
    clean(() => this.anchorLayer.removeEventListener('wheel', this.handleAnchorWheel));
    clean(() => document.removeEventListener('click', this.handleDocumentClick));
    clean(() => window.removeEventListener('resize', this.handleWindowResize));
    clean(() => { this.onAction = () => undefined; });
    clean(() => { this.onUnavailableAction = () => undefined; });
    clean(() => { this.onEventItem = () => undefined; });
    clean(() => { this.onEventChoice = () => undefined; });
    clean(() => { this.onEventFocus = () => undefined; });
    clean(() => { this.onHighlight = () => undefined; });
    clean(() => this.anchorLayouts.clear());
    if (failed) throw firstError;
  }

  private createAnchorButton(anchor: BoatInteractionAnchor): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'boat-anchor';
    button.dataset.anchorId = anchor.id;
    if (anchor.tooltip !== false) {
      const tooltip = document.createElement('span');
      tooltip.className = 'boat-tooltip ui-role-context';
      tooltip.role = 'tooltip';
      const label = document.createTextNode('');
      const separator = document.createTextNode('');
      const energy = document.createElement('span');
      energy.className = 'boat-tooltip__energy ui-role-numeral';
      energy.setAttribute('aria-hidden', 'true');
      tooltip.append(label, separator, energy);
      button.append(tooltip);
      this.anchorTooltipNodes.set(button, { tooltip, label, separator, energy });
    }
    this.anchorLayer.append(button);
    this.anchorButtons.set(anchor.id, button);
    return button;
  }

  private refreshAnchorTooltip(button: HTMLButtonElement, anchor: BoatInteractionAnchor): void {
    const backingInstanceId = anchor.backingInstanceId !== undefined
      ? anchor.backingInstanceId
      : anchor.id.startsWith('supply:') || anchor.eventChoiceId !== undefined
        ? null
        : anchor.id as ItemInstanceId;
    const item = backingInstanceId === null
      ? undefined
      : this.currentSnapshot?.inventory[backingInstanceId];
    const fallbackQuantity = anchor.itemType === 'cannedFood' ? this.currentSnapshot?.food
      : anchor.itemType === 'baitTin' ? this.currentSnapshot?.bait : undefined;
    const quantity = anchor.quantity ?? fallbackQuantity ?? 1;
    const usableQuantity = anchor.usableQuantity ?? (
      item?.condition === 'broken' ? 0 : quantity
    );
    const brokenQuantity = anchor.brokenQuantity ?? (
      item?.condition === 'broken' ? quantity : 0
    );
    const pillowSleep = anchor.toolId === 'pillow'
      ? this.eventPillowChoice()
      : undefined;
    const anchoredChoice = this.eventPresentationActive
      ? this.eventChoiceForAnchor(anchor.id, anchor)
      : undefined;
    const eventItemEligible = this.eventPresentationActive
      && backingInstanceId !== null
      && this.eventEligibility?.has(backingInstanceId) === true;
    const toolCopy = pillowSleep === undefined
      ? anchor.toolId === null ? undefined : BOAT_TOOL_COPY[anchor.toolId]
      : {
          label: 'SLEEP',
          description: 'Rest on the pillow to sleep through the current event.',
        };
    const itemLabel = anchor.label ?? (anchor.itemType === null
      ? anchor.supplyGroupId === 'repairMaterial'
        ? quantityLabel('REPAIR MATERIAL', quantity)
        : toolCopy?.label ?? 'UNKNOWN TOOL'
      : quantityLabel(ITEM_LABELS[anchor.itemType], quantity));
    const itemDescription = anchor.description ?? (anchor.itemType === null
      ? anchor.supplyGroupId === 'repairMaterial'
        ? 'Recovered timber, fasteners, and rope for hull repairs.'
        : toolCopy?.description ?? 'Permanent lifeboat equipment.'
      : SURVIVAL_ITEM_DESCRIPTIONS[anchor.itemType]);
    const action = pillowSleep !== undefined
      || anchoredChoice !== undefined
      || eventItemEligible
      || anchor.action === null
      ? null
      : ACTIONS.find(({ id }) => id === anchor.action) ?? null;
    const reason = eventItemEligible
      ? null
      : anchoredChoice !== undefined
      ? anchoredChoice.unavailableReason
      : pillowSleep === undefined
        ? this.anchorUnavailableReason(anchor)
        : pillowSleep.unavailableReason;
    const state = brokenQuantity > 0 && usableQuantity > 0
      ? `${usableQuantity} USABLE, ${brokenQuantity} BROKEN`
      : brokenQuantity > 0 ? 'BROKEN'
      : item?.condition === 'broken' ? 'BROKEN'
      : item?.condition === 'consumed' ? 'USED'
        : item?.condition === 'lost' ? 'LOST' : null;
    const preview = action !== null && this.currentSnapshot !== null
      ? actionPreview(action, this.currentSnapshot)
      : action;
    const stateText = state === null ? '' : ` — ${state}`;
    const text = action === null || preview === null
      ? `${itemLabel}${stateText} — ${itemDescription}${reason ? ` — UNAVAILABLE: ${reason}` : ''}`
      : `${itemLabel}${stateText}${itemLabel === action.label ? '' : ` — ${action.label}`} — ${itemDescription} — ${preview.cost} — ${preview.effect} — ${preview.risk.toUpperCase()}${reason ? ` — UNAVAILABLE: ${reason}` : ''}`;
    const visibleLabel = anchor.companionId === 'carlitos'
      ? anchoredChoice?.label.toLocaleUpperCase('en-US')
        ?? 'CARLITOS'
      : anchor.label ?? (anchor.itemType !== null
      ? quantityLabel(ITEM_LABELS[anchor.itemType], quantity)
      : anchor.supplyGroupId === 'repairMaterial'
        ? quantityLabel('REPAIR MATERIAL', quantity)
        : anchor.toolId === 'fishingRod'
          ? 'Fishing rod'
          : anchor.toolId === 'repairTools'
            ? 'REPAIR'
            : itemLabel);
    const energyCost = eventItemEligible
      ? 0
      : anchoredChoice?.energyCost ?? preview?.energyCost ?? 0;
    const energyIndicator = anchoredChoice === undefined
      ? '⚡'.repeat(energyCost)
      : energyCost <= 0
        ? reason === null ? '' : 'UNAVAILABLE'
        : anchoredChoice.energyOwner === 'carlitos'
          ? `CARLITOS: ${energyCost} ENERGY${reason === null ? '' : ' — UNAVAILABLE'}`
          : `${'⚡'.repeat(energyCost)}${reason === null ? '' : ' — INSUFFICIENT ENERGY'}`;
    const tooltipNodes = this.anchorTooltipNodes.get(button);
    if (tooltipNodes !== undefined) {
      tooltipNodes.tooltip.hidden = this.itemAnimationLab
        && anchor.companionId === 'carlitos';
      if (tooltipNodes.label.data !== visibleLabel) tooltipNodes.label.data = visibleLabel;
      const separator = energyIndicator === ''
        ? ''
        : anchoredChoice === undefined ? ' ' : ' — ';
      if (tooltipNodes.separator.data !== separator) tooltipNodes.separator.data = separator;
      if (tooltipNodes.energy.textContent !== energyIndicator) {
        tooltipNodes.energy.textContent = energyIndicator;
      }
    }
    const spokenCost = anchoredChoice?.energyOwner === 'carlitos'
      ? `${spokenEnergyCost(energyCost) ?? 'no energy'} from Carlitos`
      : spokenEnergyCost(energyCost);
    button.dataset.action = anchor.action ?? '';
    if (anchor.companionId === undefined) delete button.dataset.companion;
    else button.dataset.companion = anchor.companionId;
    if (anchor.itemType === null) delete button.dataset.item;
    else button.dataset.item = anchor.itemType;
    if (anchor.toolId === null) delete button.dataset.tool;
    else button.dataset.tool = anchor.toolId;
    if (backingInstanceId === null) delete button.dataset.backingInstanceId;
    else button.dataset.backingInstanceId = backingInstanceId;
    if (item === undefined) delete button.dataset.condition;
    else button.dataset.condition = item.condition;
    const spokenUnavailable = anchoredChoice !== undefined && reason !== null
      ? ', insufficient energy'
      : '';
    button.setAttribute(
      'aria-label',
      spokenCost === null
        ? `${visibleLabel}${spokenUnavailable}`
        : `${visibleLabel}, ${spokenCost}${spokenUnavailable}`,
    );
    button.setAttribute('aria-description', text);
    button.setAttribute('aria-disabled', reason === null ? 'false' : 'true');
    button.removeAttribute('aria-keyshortcuts');
  }

  private anchorUnavailableReason(anchor: BoatInteractionAnchor): string | null {
    if (anchor.depleted) return 'This recovered item is depleted.';
    return anchor.action === null ? null : this.actionReasons.get(anchor.action) ?? null;
  }

  private placeAnchorTooltip(button: HTMLButtonElement, x: number, y: number): void {
    const bounds = this.host.getBoundingClientRect();
    const viewportWidth = bounds.width || this.host.clientWidth || window.innerWidth;
    const edgeGutter = 160;
    button.dataset.tooltipX = x < edgeGutter
      ? 'left'
      : x > viewportWidth - edgeGutter ? 'right' : 'center';
    button.dataset.tooltipY = y < 96 ? 'below' : 'above';
  }

  private renderCarlitos(snapshot: SurvivalSnapshot): void {
    const carlitos = snapshot.carlitos;
    if (carlitos === null || !carlitos.alive) {
      this.closeCarlitosCard(false);
      return;
    }
    const status = carlitosStatus(carlitos);
    this.carlitosHungerLabel.textContent = status.hunger.toLocaleUpperCase('en-US');
    this.carlitosHappiness.textContent = status.happiness.toLocaleUpperCase('en-US');
    this.carlitosHealth.textContent = status.health.toLocaleUpperCase('en-US');
    this.carlitosEnergyLabel.textContent = `${carlitos.energy} / 3`;
    this.carlitosRows.hunger.dataset.state = status.hunger === 'Starving' ? 'danger' : 'stable';
    this.carlitosRows.happiness.dataset.state = (
      status.happiness === 'Depressed' || status.happiness === 'Miserable'
    ) ? 'danger' : 'stable';
    this.carlitosRows.health.dataset.state = (
      status.health === 'Sick' || status.health === 'Dying'
    ) ? 'danger' : 'stable';
    this.syncCarlitosActions();
    const anchor = [...this.anchors.values()].find(
      (candidate) => candidate.companionId === 'carlitos' && candidate.visible,
    );
    if (!this.carlitosCard.hidden && anchor !== undefined) this.positionCarlitosCard(anchor);
  }

  private syncCarlitosActions(): void {
    CARLITOS_ACTIONS.forEach((action) => {
      const button = this.carlitosActions.get(action)!;
      const reason = this.actionReasons.get(action) ?? null;
      button.disabled = this.busy;
      button.setAttribute('aria-disabled', String(this.busy || reason !== null));
      button.setAttribute(
        'aria-description',
        reason ?? (
          action === 'petCarlitos'
            ? 'Pet Carlitos.'
            : action === 'feedCarlitos'
              ? 'Feed Carlitos one food.'
              : 'Treat Carlitos with one medical kit.'
        ),
      );
    });
  }

  private openCarlitosCard(anchorButton: HTMLButtonElement): void {
    const snapshot = this.currentSnapshot;
    if (
      snapshot?.carlitos?.alive !== true
      || this.busy
      || this.paused
      || (this.eventPresentationActive && !this.itemAnimationLab)
      || this.modalOpen
      || anchorButton.disabled
      || anchorButton.getAttribute('aria-hidden') === 'true'
    ) return;
    const anchorId = anchorButton.dataset.anchorId;
    const anchor = anchorId === undefined ? undefined : this.anchors.get(anchorId);
    if (anchor?.companionId !== 'carlitos' || !anchor.visible) return;
    this.carlitosReturnTarget = anchorButton;
    this.carlitosCard.hidden = false;
    this.carlitosCard.setAttribute('aria-hidden', 'false');
    this.carlitosCard.classList.add('is-visible');
    this.positionCarlitosCard(anchor);
    this.carlitosPet.focus();
  }

  private toggleCarlitosCard(anchorButton: HTMLButtonElement): void {
    if (!this.carlitosCard.hidden) {
      this.closeCarlitosCard(true);
      return;
    }
    this.openCarlitosCard(anchorButton);
  }

  private closeCarlitosCard(restoreFocus: boolean): void {
    if (this.carlitosCard.hidden) return;
    this.carlitosCard.hidden = true;
    this.carlitosCard.setAttribute('aria-hidden', 'true');
    this.carlitosCard.classList.remove('is-visible');
    const target = this.carlitosReturnTarget;
    this.carlitosReturnTarget = null;
    if (!restoreFocus || target === null) return;
    const anchorId = target.dataset.anchorId;
    const anchor = anchorId === undefined ? undefined : this.anchors.get(anchorId);
    if (
      anchor?.companionId === 'carlitos'
      && anchor.visible
      && target.isConnected
      && !target.hidden
    ) target.focus();
  }

  private positionCarlitosCard(anchor: BoatInteractionAnchor): void {
    const rootBounds = this.host.getBoundingClientRect();
    const viewportWidth = rootBounds.width || this.host.clientWidth || window.innerWidth;
    const viewportHeight = rootBounds.height || this.host.clientHeight || window.innerHeight;
    const cardBounds = this.carlitosCard.getBoundingClientRect();
    const cardWidth = cardBounds.width || 312;
    const cardHeight = cardBounds.height || 344;
    const anchorWidth = anchor.hitArea?.width ?? DEFAULT_ANCHOR_HIT_AREA.width;
    const gutter = 16;
    const gap = 18;
    const right = anchor.x + anchorWidth / 2 + gap;
    const placeLeft = right + cardWidth > viewportWidth - gutter;
    const unclampedX = placeLeft
      ? anchor.x - anchorWidth / 2 - gap - cardWidth
      : right;
    const maximumX = Math.max(gutter, viewportWidth - gutter - cardWidth);
    const maximumY = Math.max(gutter, viewportHeight - gutter - cardHeight);
    const x = Math.min(maximumX, Math.max(gutter, unclampedX));
    const y = Math.min(maximumY, Math.max(gutter, anchor.y - cardHeight / 2));
    this.carlitosCard.style.setProperty('--carlitos-card-x', `${Math.round(x)}px`);
    this.carlitosCard.style.setProperty('--carlitos-card-y', `${Math.round(y)}px`);
    this.carlitosCard.dataset.placement = placeLeft ? 'left' : 'right';
  }

  private syncCommandState(): void {
    let highlightInvalidated = false;
    this.anchorButtons.forEach((button, id) => {
      const anchor = this.anchors.get(id);
      const reason = anchor === undefined ? null : this.anchorUnavailableReason(anchor);
      const choice = anchor === undefined ? undefined : this.eventChoiceForAnchor(id, anchor);
      const state = anchor === undefined ? 'ordinary' : this.anchorInteractionState(id, anchor);
      const eventState = state === 'eventLocked'
        ? 'locked'
        : state === 'eventAvailable'
          ? 'available'
          : state === 'eventUnavailable'
            ? 'unavailable'
            : state === 'selected'
              ? 'selected'
              : null;
      if (choice === undefined) {
        delete button.dataset.eventChoice;
        delete button.dataset.unavailableReason;
      } else {
        button.dataset.eventChoice = choice.id;
        if (choice.unavailableReason === null) delete button.dataset.unavailableReason;
        else button.dataset.unavailableReason = choice.unavailableReason;
      }
      if (eventState === null) delete button.dataset.eventState;
      else button.dataset.eventState = eventState;
      if (state === 'eventLocked') {
        button.disabled = true;
        button.tabIndex = -1;
        button.setAttribute('aria-hidden', 'true');
        button.setAttribute('aria-disabled', 'true');
        highlightInvalidated = this.invalidateAnchorHighlight(id) || highlightInvalidated;
        return;
      }
      button.tabIndex = 0;
      button.removeAttribute('aria-hidden');
      if (state === 'eventAvailable') {
        button.disabled = false;
        button.setAttribute('aria-disabled', 'false');
        return;
      }
      if (state === 'eventUnavailable' || state === 'selected') {
        button.disabled = false;
        button.setAttribute('aria-disabled', 'true');
        return;
      }
      button.disabled = this.busy;
      button.setAttribute('aria-disabled', reason === null ? 'false' : 'true');
    });
    if (highlightInvalidated) this.publishAnchorHighlight();
    this.syncCarlitosActions();
    this.syncOverlapState();
  }

  private eventPillowChoice(): EventContextChoice | undefined {
    if (!this.eventPresentationActive) return undefined;
    return this.contextualEventChoices.find((choice) => choice.id === 'sleep');
  }

  private eventChoiceForAnchor(
    id: string,
    anchor: BoatInteractionAnchor,
  ): EventContextChoice | undefined {
    if (anchor.eventChoiceId !== undefined) {
      const direct = this.contextualEventChoices.find(
        (choice) => choice.id === anchor.eventChoiceId,
      );
      if (direct !== undefined) return direct;
    }
    const projected = this.contextualEventChoices.find(
      (choice) => choice.anchorId === id,
    );
    if (projected !== undefined) return projected;
    return anchor.toolId === 'pillow' ? this.eventPillowChoice() : undefined;
  }

  private anchorInteractionState(
    id: string,
    anchor: BoatInteractionAnchor,
  ): AnchorInteractionState {
    if (!this.eventPresentationActive) return 'ordinary';
    if (this.itemAnimationLab && anchor.action === 'openChest') {
      return this.busy ? 'eventLocked' : 'ordinary';
    }
    if (anchor.eventFocusId !== undefined) {
      return this.busy || this.eventEligibility === null
        ? 'eventLocked'
        : 'eventAvailable';
    }
    const choice = this.eventChoiceForAnchor(id, anchor);
    if (choice !== undefined) {
      if (this.eventSelectedChoiceId === choice.id) return 'selected';
      if (this.busy || this.eventSelectedChoiceId !== null) return 'eventLocked';
      if (choice.unavailableReason !== null) return 'eventUnavailable';
      return 'eventAvailable';
    }
    const instanceId = anchor.backingInstanceId
      ?? (id.startsWith('supply:') ? null : id as ItemInstanceId);
    if (instanceId !== null && this.eventEligibility?.has(instanceId) === true) {
      if (this.eventSelectedInstanceId === instanceId) return 'selected';
      if (
        this.busy
        || this.eventSelectedInstanceId !== null
        || this.eventEligibility === null
      ) return 'eventLocked';
      return 'eventAvailable';
    }
    if (anchor.itemType !== null) {
      if (instanceId !== null && this.eventSelectedInstanceId === instanceId) return 'selected';
      if (
        this.busy
        || this.eventSelectedInstanceId !== null
        || this.eventEligibility === null
      ) return 'eventLocked';
      return 'eventUnavailable';
    }
    return 'eventLocked';
  }

  private isHighlightableAnchor(anchor: BoatInteractionAnchor): boolean {
    return anchor.itemType !== null
      || anchor.toolId === 'fishingRod'
      || anchor.toolId === 'repairTools'
      || anchor.toolId === 'pillow'
      || anchor.toolId === 'chest'
      || anchor.eventChoiceId !== undefined
      || anchor.eventFocusId !== undefined;
  }

  private highlightAnchorId(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const button = target.closest<HTMLButtonElement>('.boat-anchor');
    if (
      button === null
      || !this.anchorLayer.contains(button)
      || button.disabled
      || button.dataset.eventState === 'locked'
    ) return null;
    const anchorId = button.dataset.anchorId;
    const anchor = anchorId === undefined ? undefined : this.anchors.get(anchorId);
    return anchor !== undefined && this.isHighlightableAnchor(anchor) ? anchorId! : null;
  }

  private publishAnchorHighlight(): void {
    const next = this.focusedAnchorId ?? this.hoveredAnchorId;
    if (next === this.publishedAnchorId) return;
    this.publishedAnchorId = next;
    const anchor = next === null ? undefined : this.anchors.get(next);
    this.onHighlight(anchor?.backingInstanceId ?? next);
  }

  private invalidateAnchorHighlight(anchorId: string): boolean {
    let invalidated = false;
    if (this.hoveredAnchorId === anchorId) {
      this.hoveredAnchorId = null;
      invalidated = true;
    }
    if (this.focusedAnchorId === anchorId) {
      this.focusedAnchorId = null;
      invalidated = true;
    }
    return invalidated;
  }

  private activateEventChoice(button: HTMLButtonElement): void {
    const choiceId = button.dataset.eventChoice as EventResponseId | undefined;
    if (
      choiceId === undefined
      || !this.eventPresentationActive
      || this.busy
      || this.eventSelectedChoiceId !== null
      || button.getAttribute('aria-disabled') === 'true'
    ) return;
    this.onEventChoice(choiceId);
  }

  private instanceIdForButton(button: HTMLButtonElement | null): ItemInstanceId | undefined {
    return button?.dataset.backingInstanceId as ItemInstanceId | undefined
      ?? (
        button?.dataset.anchorId?.startsWith('supply:')
          ? undefined
          : button?.dataset.anchorId as ItemInstanceId | undefined
      );
  }

  private isActivationKey(key: string): boolean {
    return key === 'Enter' || key === ' ' || key === 'Spacebar';
  }

  private isFocusableCommand(element: HTMLElement | null): element is HTMLElement {
    return element !== null
      && element.isConnected
      && !element.hidden
      && element.closest('[hidden], [inert], [aria-hidden="true"]') === null
      && (!(element instanceof HTMLButtonElement) || !element.disabled);
  }

  private isUsableCommand(element: HTMLElement | null): element is HTMLElement {
    return this.isFocusableCommand(element)
      && element.getAttribute('aria-disabled') !== 'true';
  }

  private readonly handleAnchorClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (button === null || !this.anchorLayer.contains(button) || button.disabled) return;
    if (this.modalOpen) return;
    if (
      button.dataset.companion === 'carlitos'
      && !button.hasAttribute('data-event-choice')
      && (button.dataset.eventState === undefined || this.itemAnimationLab)
    ) {
      this.toggleCarlitosCard(button);
      return;
    }
    const eventFocusId = button.dataset.eventFocusId as InspectableEventId | undefined;
    if (eventFocusId !== undefined) {
      this.onEventFocus(eventFocusId);
      return;
    }
    const eventInstanceId = this.instanceIdForButton(button);
    if (
      this.eventPresentationActive
      && eventInstanceId !== undefined
      && (
        button.dataset.targetKind === 'item'
        || this.eventEligibility?.has(eventInstanceId) === true
      )
    ) {
      const choiceId = this.eventEligibility?.get(eventInstanceId);
      if (
        choiceId !== undefined
        && !this.busy
        && this.eventSelectedInstanceId === null
      ) this.onEventItem(choiceId, eventInstanceId);
      return;
    }
    const action = ACTIONS.find(({ id }) => id === button.dataset.action);
    if (button.getAttribute('aria-disabled') === 'true') {
      if (action !== undefined) {
        const reason = this.actionReasons.get(action.id);
        if (reason !== null && reason !== undefined) this.onUnavailableAction(action.id, reason);
      }
      return;
    }
    if (button.hasAttribute('data-event-choice')) {
      this.activateEventChoice(button);
      return;
    }
    if (action === undefined) return;
    const itemAnimationLabAction = this.itemAnimationLab && action.id === 'openChest';
    if (this.eventPresentationActive && !itemAnimationLabAction) return;
    this.onAction(action.id, button);
  };

  private readonly handleCarlitosClick = (event: MouseEvent): void => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('button');
    if (button === null || !this.carlitosCard.contains(button) || button.disabled) return;
    if (this.modalOpen) return;
    if (button.hasAttribute('data-carlitos-close')) {
      this.closeCarlitosCard(true);
      return;
    }
    const action = ACTIONS.find(({ id }) => id === button.dataset.action);
    if (action === undefined) return;
    if (button.getAttribute('aria-disabled') === 'true') {
      const reason = this.actionReasons.get(action.id);
      if (reason !== null && reason !== undefined && !this.modalOpen) {
        this.onUnavailableAction(action.id, reason);
      }
      return;
    }
    if (this.modalOpen || (this.eventPresentationActive && !this.itemAnimationLab)) return;
    this.onAction(action.id, button);
  };

  private readonly handleDocumentClick = (event: MouseEvent): void => {
    if (this.disposed || this.carlitosCard.hidden) return;
    const target = event.target;
    if (!(target instanceof Node)) return;
    if (this.carlitosCard.contains(target) || this.carlitosReturnTarget?.contains(target)) return;
    const restoreFocus = !this.busy
      && !this.eventPresentationActive
      && !this.paused
      && !this.modalOpen;
    this.closeCarlitosCard(restoreFocus);
  };

  private readonly handleWindowResize = (): void => {
    if (this.disposed) return;
    const anchor = [...this.anchors.values()].find(
      (candidate) => candidate.companionId === 'carlitos' && candidate.visible,
    );
    if (!this.carlitosCard.hidden && anchor !== undefined) this.positionCarlitosCard(anchor);
  };

  private readonly handleAnchorPointerOver = (event: Event): void => {
    this.hoveredAnchorId = this.highlightAnchorId(event.target);
    this.publishAnchorHighlight();
  };

  private readonly handleAnchorPointerOut = (event: Event): void => {
    const pointerEvent = event as MouseEvent;
    const current = this.highlightAnchorId(event.target);
    if (current === null || this.highlightAnchorId(pointerEvent.relatedTarget) === current) return;
    if (this.hoveredAnchorId === current) this.hoveredAnchorId = null;
    this.publishAnchorHighlight();
  };

  private readonly handleAnchorFocusIn = (event: FocusEvent): void => {
    const anchorId = this.highlightAnchorId(event.target);
    if (anchorId === null && event.target instanceof Element) {
      const button = event.target.closest<HTMLButtonElement>('.boat-anchor');
      if (button?.disabled || button?.dataset.eventState === 'locked') button?.blur();
    }
    this.focusedAnchorId = anchorId;
    this.publishAnchorHighlight();
  };

  private readonly handleAnchorFocusOut = (event: FocusEvent): void => {
    const current = this.highlightAnchorId(event.target);
    if (current === null || this.highlightAnchorId(event.relatedTarget) === current) return;
    if (this.focusedAnchorId === current) this.focusedAnchorId = null;
    this.publishAnchorHighlight();
  };

  private readonly handleAnchorWheel = (event: WheelEvent): void => {
    if (event.deltaY === 0 || this.busy || this.modalOpen || this.paused) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const button = target.closest<HTMLButtonElement>('.boat-anchor');
    if (button === null || !this.anchorLayer.contains(button)) return;
    if (!this.cycleOverlappingAnchor(button, event.deltaY > 0 ? 1 : -1)) return;
    event.preventDefault();
  };

  private cycleOverlappingAnchor(
    current: HTMLButtonElement,
    direction: -1 | 1,
  ): boolean {
    const currentId = current.dataset.anchorId;
    if (currentId === undefined) return false;
    const candidates = [...this.anchorButtons.values()]
      .filter((button) => {
        const id = button.dataset.anchorId;
        return id !== undefined
          && this.isCycleCandidate(button, this.anchors.get(id))
          && this.anchorIdsOverlap(currentId, id);
      })
      .sort((left, right) => {
        const leftDepth = this.anchors.get(left.dataset.anchorId!)?.hitArea?.depth ?? 0;
        const rightDepth = this.anchors.get(right.dataset.anchorId!)?.hitArea?.depth ?? 0;
        return leftDepth - rightDepth;
      });
    if (candidates.length < 2) return false;
    const currentIndex = candidates.indexOf(current);
    const nextIndex = (Math.max(0, currentIndex) + direction + candidates.length)
      % candidates.length;
    this.selectCycledAnchor(candidates[nextIndex]!);
    return true;
  }

  private isCycleCandidate(
    button: HTMLButtonElement,
    anchor: BoatInteractionAnchor | undefined,
  ): anchor is BoatInteractionAnchor {
    return anchor !== undefined
      && anchor.visible
      && this.isHighlightableAnchor(anchor)
      && this.isFocusableCommand(button)
      && button.dataset.eventState !== 'locked';
  }

  private anchorIdsOverlap(firstId: string, secondId: string): boolean {
    const first = this.anchors.get(firstId);
    const second = this.anchors.get(secondId);
    if (first === undefined || second === undefined) return false;
    const firstArea = first.hitArea ?? DEFAULT_ANCHOR_HIT_AREA;
    const secondArea = second.hitArea ?? DEFAULT_ANCHOR_HIT_AREA;
    return Math.abs(first.x - second.x) * 2 < firstArea.width + secondArea.width
      && Math.abs(first.y - second.y) * 2 < firstArea.height + secondArea.height;
  }

  private selectCycledAnchor(button: HTMLButtonElement): void {
    if (this.cycledAnchorId !== null) this.restoreAnchorDepth(this.cycledAnchorId);
    this.cycledAnchorId = button.dataset.anchorId ?? null;
    button.style.zIndex = '100001';
    button.focus({ preventScroll: true });
    this.focusedAnchorId = this.cycledAnchorId;
    this.publishAnchorHighlight();
  }

  private restoreAnchorDepth(anchorId: string): void {
    const button = this.anchorButtons.get(anchorId);
    const layout = this.anchorLayouts.get(anchorId);
    if (button !== undefined && layout !== undefined) {
      button.style.zIndex = String(layout.zIndex);
    }
  }

  private syncOverlapState(): void {
    let cycleIsValid = false;
    this.anchorButtons.forEach((button, id) => {
      const anchor = this.anchors.get(id);
      let count = 0;
      if (this.isCycleCandidate(button, anchor)) {
        this.anchorButtons.forEach((candidate, candidateId) => {
          if (
            this.isCycleCandidate(candidate, this.anchors.get(candidateId))
            && this.anchorIdsOverlap(id, candidateId)
          ) count += 1;
        });
      }
      if (count > 1) {
        button.dataset.overlapCount = String(count);
        button.setAttribute('aria-keyshortcuts', 'ArrowLeft ArrowRight');
        if (id === this.cycledAnchorId) cycleIsValid = true;
      } else {
        delete button.dataset.overlapCount;
        button.removeAttribute('aria-keyshortcuts');
      }
    });
    if (this.cycledAnchorId !== null && !cycleIsValid) {
      this.restoreAnchorDepth(this.cycledAnchorId);
      this.cycledAnchorId = null;
    }
    if (this.cycledAnchorId !== null) {
      const selected = this.anchorButtons.get(this.cycledAnchorId);
      if (selected !== undefined) selected.style.zIndex = '100001';
    }
  }
}
