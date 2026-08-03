/*
 * Chrome match patterns cannot wildcard a TLD, so every marketplace is
 * listed explicitly. amazon.com ships enabled (host_permissions); the rest
 * sit in optional_host_permissions and the options page requests them.
 * Keep this list in step with both manifests.
 */

interface AcpMarketplace {
  host: string;
  defaultEnabled: boolean;
}

const ACP_MARKETPLACES: readonly AcpMarketplace[] = [
  { host: "amazon.com", defaultEnabled: true },
  { host: "amazon.ca", defaultEnabled: false },
  { host: "amazon.com.mx", defaultEnabled: false },
  { host: "amazon.com.br", defaultEnabled: false },
  { host: "amazon.co.uk", defaultEnabled: false },
  { host: "amazon.ie", defaultEnabled: false },
  { host: "amazon.de", defaultEnabled: false },
  { host: "amazon.fr", defaultEnabled: false },
  { host: "amazon.it", defaultEnabled: false },
  { host: "amazon.es", defaultEnabled: false },
  { host: "amazon.nl", defaultEnabled: false },
  { host: "amazon.se", defaultEnabled: false },
  { host: "amazon.pl", defaultEnabled: false },
  { host: "amazon.com.be", defaultEnabled: false },
  { host: "amazon.com.tr", defaultEnabled: false },
  { host: "amazon.sa", defaultEnabled: false },
  { host: "amazon.ae", defaultEnabled: false },
  { host: "amazon.eg", defaultEnabled: false },
  { host: "amazon.in", defaultEnabled: false },
  { host: "amazon.co.jp", defaultEnabled: false },
  { host: "amazon.sg", defaultEnabled: false },
  { host: "amazon.com.au", defaultEnabled: false },
];

function acpMatchPattern(host: string): string {
  return "*://*." + host + "/*";
}
