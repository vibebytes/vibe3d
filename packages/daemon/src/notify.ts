/** Replaces the system-browser opener when an embedding host wants the open events: POST the
 * tokenised editor url to the host's loopback listener. Failures stay silent — autoOpen already
 * logs ok:false, and a broken panel must never break scene dispatch.
 */
export function notifyOpensOpener(
  endpoint: string,
  fetchImpl: typeof fetch = fetch,
) {
  return async (open: { url: string; roomId?: string }): Promise<boolean> => {
    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(open),
      });
      return res.ok;
    } catch {
      return false;
    }
  };
}
