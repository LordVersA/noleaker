postMessage({
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  language: navigator.language,
  cores: navigator.hardwareConcurrency,
});
