export type Theme = 'light' | 'dark';

export const THEME_COOKIE = 'theme';
const THEME_CHANGE_EVENT = 'themechange';
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Dark mode is opt-in: anything but an explicit saved `dark` renders light. */
export function parseTheme(value: string | null | undefined): Theme {
	return value === 'dark' ? 'dark' : 'light';
}

export function isDarkThemeActive(): boolean {
	return parseTheme(document.documentElement.dataset.theme) === 'dark';
}

export function setTheme(theme: Theme): void {
	document.documentElement.dataset.theme = theme;
	document.cookie = `${THEME_COOKIE}=${theme}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
	window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
}

export function onThemeChange(listener: () => void): () => void {
	window.addEventListener(THEME_CHANGE_EVENT, listener);
	return () => window.removeEventListener(THEME_CHANGE_EVENT, listener);
}
