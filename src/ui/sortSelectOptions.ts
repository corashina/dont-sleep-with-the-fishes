import { getLanguage } from '../i18n/language';

export function sortSelectOptions(select: HTMLSelectElement): void {
  const selected = select.value;
  const collator = new Intl.Collator(getLanguage(), { sensitivity: 'base' });
  for (const group of [select, ...select.querySelectorAll('optgroup')]) {
    const options = [...group.querySelectorAll<HTMLOptionElement>(':scope > option')];
    options.sort((a, b) => collator.compare(a.label, b.label));
    group.append(...options);
  }
  select.value = selected;
}
