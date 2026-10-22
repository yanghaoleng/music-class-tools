(() => {
  let preference = "system";
  try { preference = localStorage.getItem("xianji.appearance.v1") || "system"; } catch {}
  const dark = preference === "dark" || (preference !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]').content = dark ? "#1a1c20" : "#faf9f6";
})();
