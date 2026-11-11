/** Native Google Maps render gates: prevent successful MP4 status with missing map pixels. */
const FATAL_MAP_LINE = /Google Maps JavaScript API error:|MapsRequestError.*PERMISSION_DENIED|ROUTES_COMPUTE_ROUTES.*PERMISSION_DENIED|ApiProjectMapError|ApiTargetBlockedMapError|BillingNotEnabledMapError/;
export function googleMapErrorLine(line) {
  return FATAL_MAP_LINE.test(line) ? String(line).slice(0,400) : '';
}
export function nativeMapMissingKey(node, inheritedKey = '') {
  if (!node || typeof node !== 'object') return false;
  if (node.type === 'map' && node.mapType !== 'schematic' && !node.googleMapsApiKey && !inheritedKey) return true;
  return Array.isArray(node.children) && node.children.some(child => nativeMapMissingKey(child,inheritedKey));
}
