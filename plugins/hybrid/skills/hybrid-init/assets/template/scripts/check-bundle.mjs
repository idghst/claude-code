#!/usr/bin/env node
// 첫 화면 JS(gzip) 합계가 예산을 넘으면 실패한다 (스펙 6장: 100KB). 사용법: npm run size (= node scripts/check-bundle.mjs [buildDir])
// build/index.html이 처음에 받는 JS = <script src>, <link rel="modulepreload">, 인라인 부트스트랩의 import("...").
// shortcut: SPA라 첫 라우트의 페이지 노드(nodes/N.js)는 index.html에 없어 합계에서 빠진다. 첫 화면 페이지가 커지면 .svelte-kit/output/client/.vite/manifest.json으로 해당 노드까지 더한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export const BUDGET_BYTES = 100 * 1024;

/** index.html에서 첫 화면에 로드되는 JS 경로 목록. */
export function initialScripts(html) {
	const urls = new Set();
	for (const [tag] of html.matchAll(/<(?:script|link)\b[^>]*>/g)) {
		const src = /\ssrc="([^"]+)"/.exec(tag)?.[1] ?? (/\srel="modulepreload"/.test(tag) ? /\shref="([^"]+)"/.exec(tag)?.[1] : undefined);
		if (src) urls.add(src);
	}
	for (const [, src] of html.matchAll(/import\("([^"]+)"\)/g)) urls.add(src);
	return [...urls];
}

/** buildDir/index.html 기준 첫 화면 JS의 파일별·합계 gzip 크기. */
export function measure(buildDir) {
	const html = fs.readFileSync(path.join(buildDir, 'index.html'), 'utf8');
	const files = initialScripts(html).map((url) => {
		if (/^[a-z]+:|^\/\//i.test(url)) throw new Error(`앱 번들 밖 스크립트: ${url}`);
		return { url, gzip: gzipSync(fs.readFileSync(path.join(buildDir, url))).length };
	});
	return { files, total: files.reduce((sum, f) => sum + f.gzip, 0) };
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
	try {
		const { files, total } = measure(process.argv[2] ?? 'build');
		for (const f of files) console.log(`${(f.gzip / 1024).toFixed(1).padStart(7)} KB  ${f.url}`);
		const ok = total <= BUDGET_BYTES;
		console.log(`${ok ? '✔' : '✘'} 첫 화면 JS(gzip) ${(total / 1024).toFixed(1)} KB / 예산 ${BUDGET_BYTES / 1024} KB`);
		process.exitCode = ok ? 0 : 1;
	} catch (error) {
		console.error(`✘ ${error.message} (npm run build를 먼저 실행하세요)`);
		process.exitCode = 2;
	}
}
