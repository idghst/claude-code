import { SplashScreen } from '@capacitor/splash-screen';
import type { Splash } from '../types';

export const splash: Splash = { hide: () => SplashScreen.hide() };
