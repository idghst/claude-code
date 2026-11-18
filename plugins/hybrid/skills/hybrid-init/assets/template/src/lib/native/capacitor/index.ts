import type { NativeServices } from '../types';
import { appInfo } from './app-info';
import { links } from './links';
import { secureStorage } from './secure-storage';
import { splash } from './splash';

export const capacitorServices: NativeServices = { secureStorage, appInfo, splash, links };
