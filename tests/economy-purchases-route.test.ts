import {expect, it, vi} from 'vitest';
import {NextRequest} from 'next/server';
const state = vi.hoisted(() => ({requireUser: vi.fn(), list: vi.fn()}));
vi.mock('@/lib/platform/auth', () => ({requireUser: state.requireUser}));
vi.mock('@/lib/platform/economy-purchases', () => ({listOwnedEconomyPurchases: state.list}));
import {PlatformError} from '@/lib/platform/http';
import {GET} from '@/app/api/economy/purchases/route';
it('rejects unauthenticated reads before querying any purchases', async () => {
  state.requireUser.mockRejectedValue(new PlatformError(401, 'AUTH_REQUIRED', 'Sign in.'));
  const response = await GET(new NextRequest('https://obolos.app/api/economy/purchases?userId=someone-else'));
  expect(response.status).toBe(401); expect(state.list).not.toHaveBeenCalled();
});
it('uses session ownership even when a caller supplies a different owner', async () => {
  state.requireUser.mockResolvedValue({id: 'actual-owner'}); state.list.mockResolvedValue({orders: [], indexedAt: null});
  const response = await GET(new NextRequest('https://obolos.app/api/economy/purchases?userId=someone-else'));
  expect(response.status).toBe(200); expect(state.list).toHaveBeenCalledWith('actual-owner');
  expect(response.headers.get('cache-control')).toContain('no-store');
});
