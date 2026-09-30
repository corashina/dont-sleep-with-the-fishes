export function uiScaleForViewport(width: number, height: number): number {
  return Math.min(1, Math.max(0.75, Math.min(width / 2560, height / 1440)));
}

export function installUiScale(): () => void {
  const update = (): void => {
    document.documentElement.style.setProperty(
      '--ui-scale', String(uiScaleForViewport(window.innerWidth, window.innerHeight)),
    );
  };
  update();
  window.addEventListener('resize', update);
  return () => window.removeEventListener('resize', update);
}
