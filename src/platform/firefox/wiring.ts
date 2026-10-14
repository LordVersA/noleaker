import { onProxyError } from '../../background/monitor';
import { firefoxProxy, onRequest } from './routing';

// Registered synchronously when the background starts, so Firefox keeps (primes) the listener and
// holds early requests until it answers. Imported for its side effects by the background entry.
firefoxProxy().onRequest.addListener(onRequest, { urls: ['<all_urls>'] });
firefoxProxy().onError.addListener((error) => onProxyError({ error: error.message }));
