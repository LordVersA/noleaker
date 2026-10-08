self.addEventListener('message', (e) =>
  e.source?.postMessage({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
  }),
);
