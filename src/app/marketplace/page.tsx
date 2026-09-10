import { Marketplace } from '@/components/platform/marketplace';
import { PlatformShell } from '@/components/platform/shell';

export const metadata = {title:'Product — Marketplace | Obolos',description:'Discover repository verification services, publish a listing and receive test USDC directly on Arc.'};

export default function MarketplacePage() {
  return <PlatformShell active="marketplace"><Marketplace /></PlatformShell>;
}
