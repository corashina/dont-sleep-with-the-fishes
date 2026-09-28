type DeviceNavigator = Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'> & {
  readonly userAgentData?: { readonly mobile: boolean; readonly platform: string };
};

export function isMobileDevice(device: DeviceNavigator = navigator): boolean {
  if (device.userAgentData?.mobile) return true;
  if (/Android|iOS/i.test(device.userAgentData?.platform ?? '')) return true;
  if (/Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(device.userAgent)) return true;
  // iPadOS can identify itself as a Mac when it requests desktop sites.
  return (device.platform === 'MacIntel' || /Macintosh/i.test(device.userAgent))
    && device.maxTouchPoints > 1;
}
