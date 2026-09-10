import { Marketplace } from '@/components/platform/marketplace';
import { PlatformShell } from '@/components/platform/shell';

export default function MarketplacePage() {
  return <PlatformShell active="marketplace"><Marketplace /></PlatformShell>;
}
