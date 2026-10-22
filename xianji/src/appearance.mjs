const KEY = 'xianji.appearance.v1';
export function readAppearance() {
  try {
    const value = localStorage.getItem(KEY);
    return ['light', 'dark'].includes(value) ? value : 'system';
  } catch { return 'system'; }
}
export function applyAppearance(preference, systemDark) {
  const dark = preference === 'dark' || (preference === 'system' && systemDark);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = dark ? '#1a1c20' : '#faf9f6';
  try { localStorage.setItem(KEY, preference); } catch {}
}
