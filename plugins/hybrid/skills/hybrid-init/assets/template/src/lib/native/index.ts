import type { NativeServices } from './types';
import { capacitorServices } from './capacitor';

// 구현체 교체 시 이 한 줄만 변경 (스펙 7.1)
export const native: NativeServices = capacitorServices;
