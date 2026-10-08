onconnect = (e) =>
  e.ports[0].postMessage({
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    language: navigator.language,
  });
