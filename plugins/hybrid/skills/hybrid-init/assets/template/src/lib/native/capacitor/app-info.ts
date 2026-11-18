import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { AppInfo } from '../types';

export const appInfo: AppInfo = {
	version: async () => (Capacitor.isNativePlatform() ? (await App.getInfo()).version : null),
	platform: () => Capacitor.getPlatform() as 'ios' | 'android' | 'web'
};
