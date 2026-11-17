/**
 * Whether what was typed as an address names a host, for the checks that add `https://` to an
 * address typed without a scheme (#385).
 *
 * Those checks asked for a dot, so `myserver:1124`, `localhost:3000` or an intranet name such as
 * `homeassistant` was refused as "Invalid URL" and a person had to type `myserver:1124/#.` to get
 * past it. A host name does not need a dot. Anything the dot rule accepted is still accepted, so
 * no address that worked stops working.
 */
const LABEL = String.raw`[a-z0-9](?:[a-z0-9-]*[a-z0-9])?`;
const HOST = String.raw`(?:localhost|${LABEL}(?:\.${LABEL})*|\[[0-9a-f:.]+\])`;
const HOST_ADDRESS = new RegExp(
  String.raw`^(?:https?://)?(?:[^@/?#\s]*@)?${HOST}(?::\d{1,5})?(?:[/?#]\S*)?$`,
  'i',
);

export function hasUsableHost(input: string): boolean {
  const text = input.trim();
  return text.includes('.') || HOST_ADDRESS.test(text);
}
