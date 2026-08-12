export const THEME_STORAGE_KEY = "gh-store-theme";

export type ThemePreference = "dark" | "light";

/**
 * Inline script that applies the stored theme before first paint.
 *
 * It must stay dependency-free and synchronous: anything async would let the
 * default dark theme paint first and flash when a light-theme visitor loads a
 * page. Wrapped in try/catch because storage access throws in some privacy
 * modes.
 */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(!t){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}if(t==="light"){document.documentElement.dataset.theme="light"}}catch(e){}`;
