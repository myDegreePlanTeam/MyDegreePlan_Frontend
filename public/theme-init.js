/* Sets the colour theme before first paint, so a stored light theme does not flash dark.
   The same rule as src/lib/theme.js (src/tests/theme.test.js runs this file against it). Classic script, no imports:
   the Windows app and the Docker web container refuse inline scripts, so this is a file. */
(function () {
  var stored
  try { stored = localStorage.getItem('theme') } catch { /* storage blocked */ }
  var theme = stored === 'light' || stored === 'dark'
    ? stored
    : (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
  document.documentElement.setAttribute('data-theme', theme)
})()
