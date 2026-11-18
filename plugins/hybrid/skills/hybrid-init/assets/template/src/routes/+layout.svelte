<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { native } from '#lib/native/index.ts';
	import { cachedAppConfig, compareVersions, loadAppConfig } from '#lib/security/app-config.ts';
	import { appConfig } from '#lib/security/config.svelte.ts';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
	let version = $state<string | null>(null);
	const platform = native.appInfo.platform();
	// 웹(브라우저 개발)은 버전이 없어 강제 업데이트를 건너뛴다.
	const outdated = $derived(version !== null && compareVersions(version, appConfig.current.minVersion) < 0);
	const storeUrl = $derived(platform === 'web' ? undefined : appConfig.current.storeUrl?.[platform]);

	onMount(async () => {
		try {
			// 캐시(없으면 기본값)로 먼저 그려 네트워크를 기다리지 않는다.
			appConfig.current = (await cachedAppConfig(native.secureStorage)) ?? appConfig.current;
			version = await native.appInfo.version();
		} finally {
			// 첫 화면을 그린 뒤 스플래시를 내린다(흰 화면 깜빡임 방지, 스펙 6장).
			await tick();
			await native.splash.hide();
		}
		appConfig.current = await loadAppConfig({
			apiBase: import.meta.env.VITE_API_BASE_URL ?? '',
			publicKey: import.meta.env.VITE_APP_CONFIG_PUBLIC_KEY ?? '',
			dev: import.meta.env.DEV,
			storage: native.secureStorage
		});
	});
</script>

{#if outdated}
	<main>
		<h1>업데이트가 필요합니다</h1>
		<p>안전하게 사용하려면 최신 버전으로 업데이트하세요.</p>
		{#if storeUrl}
			<button type="button" onclick={() => native.links.open(storeUrl)}>스토어에서 업데이트</button>
		{/if}
	</main>
{:else}
	{#if appConfig.current.notice}
		<p role="alert" data-level={appConfig.current.notice.level}>{appConfig.current.notice.message}</p>
	{/if}
	{@render children()}
{/if}
