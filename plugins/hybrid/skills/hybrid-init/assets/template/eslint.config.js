import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, globalIgnores, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');
const STORAGE_MESSAGE = '웹 저장소에 데이터를 두지 않는다(토큰 유출 위험). native.secureStorage를 쓴다 (스펙 8.3).';
const WEB_STORAGES = ['localStorage', 'sessionStorage', 'indexedDB'];

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	// 네이티브 프로젝트(cap sync가 복사한 빌드 결과 포함)는 린트하지 않는다.
	globalIgnores(['android/', 'ios/']),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			'no-undef': 'off'
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser
			}
		}
	},
	// 보안 규칙 (스펙 8.1, 8.3)
	{
		rules: {
			'no-eval': 'error',
			'no-implied-eval': 'error',
			'no-new-func': 'error',
			'svelte/no-at-html-tags': 'error',
			'no-restricted-globals': ['error', ...WEB_STORAGES.map((name) => ({ name, message: STORAGE_MESSAGE }))],
			'no-restricted-syntax': [
				'error',
				{ selector: `MemberExpression[property.name=/^(${WEB_STORAGES.join('|')})$/]`, message: STORAGE_MESSAGE }
			]
		}
	},
	// 네이티브 호출은 src/lib/native/ 어댑터로만 (스펙 7.1)
	{
		files: ['src/**'],
		ignores: ['src/lib/native/**'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					patterns: [
						{
							group: ['@capacitor/*', '@aparajita/*'],
							message: '네이티브 기능은 #lib/native/index.ts의 native로만 호출한다 (스펙 7.1). 새 기능은 /hybrid:hybrid-native.'
						}
					]
				}
			]
		}
	}
);
