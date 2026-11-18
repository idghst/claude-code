import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			// SPA: 모든 경로를 build/index.html 하나로 처리한다. 앱 번들에 넣어 로컬에서 로드한다(원격 로드 금지).
			adapter: adapter({ fallback: 'index.html' }),
			// 스펙 8.1 CSP. build/index.html에 <meta>로 들어가고, 인라인 부트스트랩 스크립트는 sha256 해시로 허용된다.
			// frame-ancestors는 <meta>에서 무시돼 넣지 않는다. 앱은 로컬에서 로드되므로 외부 사이트가 프레임으로 넣을 수 없다.
			// API 주소를 바꾸면 connect-src와 .env의 VITE_API_BASE_URL을 함께 바꾼다.
			csp: {
				mode: 'hash',
				directives: {
					'default-src': ['self'],
					'script-src': ['self', 'wasm-unsafe-eval'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'data:', 'blob:', 'https:'],
					'connect-src': ['self', '{{API_ORIGIN}}'],
					'object-src': ['none'],
					'base-uri': ['self']
				}
			}
		})
	]
});
