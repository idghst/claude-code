import { Browser } from '@capacitor/browser';
import type { ExternalLinks } from '../types';

export const links: ExternalLinks = {
	async open(url) {
		if (new URL(url).protocol !== 'https:') throw new Error(`https 링크만 열 수 있습니다: ${url}`);
		await Browser.open({ url });
	}
};
