export function createElementRequirement(label: string) {
  return function requireElement<T extends Element>(root: ParentNode, selector: string): T {
    const element = root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing ${label} element: ${selector}`);
    return element;
  };
}
