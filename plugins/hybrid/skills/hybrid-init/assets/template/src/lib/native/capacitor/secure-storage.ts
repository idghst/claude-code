import { KeychainAccess, SecureStorage as Plugin } from '@aparajita/capacitor-secure-storage';
import { Capacitor } from '@capacitor/core';
import type { SecureStorage } from '../types';

// 웹(브라우저 개발)에서는 플러그인이 localStorage에 저장하므로 쓰지 않고 메모리에만 둔다(새로고침하면 사라짐).
const memory = new Map<string, string>();

export const secureStorage: SecureStorage = Capacitor.isNativePlatform()
	? {
			async get(key) {
				const value = await Plugin.get(key, false);
				return typeof value === 'string' ? value : null;
			},
			// iOS Keychain: 잠금 해제 중에만 읽고, 백업으로 다른 기기에 옮겨가지 않게 한다. Android는 Keystore 암호화.
			set: (key, value) => Plugin.set(key, value, false, false, KeychainAccess.whenUnlockedThisDeviceOnly),
			async remove(key) {
				await Plugin.remove(key);
			}
		}
	: {
			get: async (key) => memory.get(key) ?? null,
			set: async (key, value) => void memory.set(key, value),
			remove: async (key) => void memory.delete(key)
		};
