import type {MarketService, VerificationService} from './contracts';

export function selectionPriceState(signed: VerificationService | undefined, services: MarketService[]) {
  if (!signed) return {state:'unselected' as const};
  const current = services.find(service => service.id === signed.id && service.active);
  if (!current) return {state:'unavailable' as const, signed};
  const changed = current.revision !== signed.revision || current.priceAtomic !== signed.priceAtomic || current.recipient.toLowerCase() !== signed.recipient.toLowerCase() || current.endpoint !== signed.endpoint || current.name !== signed.name || current.providerEndpoint !== ('providerEndpoint' in signed ? signed.providerEndpoint : undefined);
  return {state:changed ? 'changed' as const : 'current' as const, signed, current, deltaAtomic:current.priceAtomic-signed.priceAtomic};
}
export function priceChangeLabel(before: number, after: number) {
  if (before === after) return 'Price unchanged';
  const percent = Math.abs((after-before)/before*100);
  return `${after > before ? 'Up' : 'Down'} ${percent.toLocaleString('en-US',{maximumFractionDigits:1})}%`;
}
