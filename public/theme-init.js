// Applies the saved theme and reading mode before the first paint, so there is no flash.
(function () {
  var themes = ['system', 'light', 'dark', 'contrast'];
  var theme = 'system';
  var reading = 'standard';
  try {
    var saved = JSON.parse(localStorage.getItem('utsav:v1:settings') || '{}');
    if (themes.indexOf(saved.theme) !== -1) theme = saved.theme;
    if (saved.reading === 'simple') reading = 'simple';
  } catch (error) {
    // Storage can be blocked; the defaults still work.
  }
  if (theme === 'system') {
    theme = window.matchMedia('(prefers-contrast: more)').matches
      ? 'contrast'
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
  }
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.setAttribute('data-reading', reading);
})();
