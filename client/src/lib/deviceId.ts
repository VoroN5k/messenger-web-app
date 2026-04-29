// Manages the v3 device registration ID for the current browser.
// Cleared when E2E keys are reset (clearDeviceId called from clearAllKeyMaterial).

const KEY = (userId: number) => `v3_device_${userId}`;

export function getStoredDeviceId(userId: number): number | null {
    if (typeof localStorage === 'undefined') return null;
    const v = localStorage.getItem(KEY(userId));
    return v ? parseInt(v, 10) : null;
}

export function storeDeviceId(userId: number, deviceId: number): void {
    localStorage.setItem(KEY(userId), String(deviceId));
}

export function clearDeviceId(userId: number): void {
    localStorage.removeItem(KEY(userId));
}
