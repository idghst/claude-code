// 무거운 연산 어댑터 자리 (스펙 3.1, 7.1). 지금은 구현이 없다.
// 메인 스레드를 50ms 이상 막는 연산이 생기면 /hybrid:hybrid-rust 로 Rust(WASM + Web Worker) 구현을 붙이고,
// UI는 여기 정의한 인터페이스만 호출한다. 예: export interface Compute { hash(data: Uint8Array): Promise<Uint8Array>; }
export {};
