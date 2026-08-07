/*
 * Chrome match patterns cannot wildcard a TLD, so every marketplace is
 * listed explicitly. All of them ship enabled: host_permissions and the
 * content script matches in both manifests carry the full list. Keep this
 * list in step with both manifests.
 */

const ACP_MARKETPLACES: readonly string[] = [
  "amazon.com",
  "amazon.ca",
  "amazon.com.mx",
  "amazon.com.br",
  "amazon.co.uk",
  "amazon.ie",
  "amazon.de",
  "amazon.fr",
  "amazon.it",
  "amazon.es",
  "amazon.nl",
  "amazon.se",
  "amazon.pl",
  "amazon.com.be",
  "amazon.com.tr",
  "amazon.sa",
  "amazon.ae",
  "amazon.eg",
  "amazon.in",
  "amazon.co.jp",
  "amazon.sg",
  "amazon.com.au",
];

function acpMatchPattern(host: string): string {
  return "*://*." + host + "/*";
}
