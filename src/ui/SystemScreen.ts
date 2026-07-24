export type SystemScreenKind = 'loading' | 'error';

export interface SystemScreenDescription {
  readonly kind: SystemScreenKind;
  readonly kicker: string;
  readonly title: string;
  readonly lead: string;
  readonly detail?: string;
}

function textElement(
  tagName: 'p' | 'h1',
  className: string,
  text: string,
): HTMLElement {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  return element;
}

export function createSystemScreen(
  description: SystemScreenDescription,
): HTMLElement {
  const section = document.createElement('section');
  section.className = [
    'screen',
    'is-visible',
    'system-screen',
    'poster-screen',
    `system-screen--${description.kind}`,
  ].join(' ');

  const content = document.createElement('div');
  content.className = 'screen__content';
  content.append(
    textElement('p', 'kicker ui-role-context', description.kicker),
    textElement('h1', 'ui-role-display', description.title),
    textElement('p', 'lead ui-role-narrative', description.lead),
  );
  if (description.detail !== undefined) {
    content.append(textElement(
      'p',
      'fine-print ui-role-narrative',
      description.detail,
    ));
  }
  section.append(content);
  return section;
}
