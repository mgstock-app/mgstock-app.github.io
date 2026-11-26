// Offline receipt verification for a future one-shot pilot. It does not dispatch,
// create a subscription, read a provider, or release a quota reservation.
import {verifyYCloudSignature} from './bridge.mjs';

const safeId = v => typeof v === 'string' && /^[a-zA-Z0-9_.:-]{1,200}$/.test(v);
const positive = v => typeof v === 'number' && Number.isFinite(v) && v > 0;
const result = (state, extra = {}) => ({state, sendAllowed:false, ...extra});

// expected is trusted server-side metadata recorded from an accepted request,
// not an inbound customer value. Both identifiers must match the ledger.
export async function inspectSignedReceipt({raw, signature, secret, expected, now = Date.now()} = {}) {
  if (!safeId(expected?.messageId) || !safeId(expected?.externalId) ||
      !/^[A-Z]{3}$/.test(expected?.currency ?? '')) return result('unverified');
  if (!await verifyYCloudSignature({raw, signature, secret, now})) return result('unverified');
  let event;
  try {
    event = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder('utf-8', {fatal:true}).decode(raw));
  } catch { return result('unverified'); }
  if (event?.type !== 'whatsapp.message.updated' || event.apiVersion !== 'v2' ||
      !safeId(event.id)) return result('unverified');
  const m = event.whatsappMessage;
  if (m?.id !== expected.messageId || m.externalId !== expected.externalId ||
      m.groupId || m.type !== 'text' || m.bizType !== 'whatsapp') return result('unverified');
  // Accepted/sent prices are estimates. A failure can be followed by a delivery
  // on another device. Neither can prove a free delivered reply or release quota.
  if (m.status === 'accepted' || m.status === 'sent' || m.status === 'failed')
    return result('pending');
  if (m.status !== 'delivered' && m.status !== 'read') return result('unverified');
  if (positive(m.totalPrice) || m.pricingType === 'regular') return result('block_cost');
  if (m.pricingModel !== 'PMP' || m.pricingType !== 'free_customer_service' ||
      m.pricingCategory !== 'service' || m.currency !== expected.currency ||
      m.totalPrice !== 0) return result('unverified');
  return result('free_delivered');
}

// Merge notifications conservatively; duplicated/out-of-order messages cannot
// clear a cost warning or turn a conflicting receipt into a verified free reply.
// Store only this state on a future ledger, never customer content or raw events.
export function mergeReceiptState(previous = 'pending', next = 'unverified') {
  const valid = new Set(['pending','free_delivered','unverified','block_cost']);
  if (!valid.has(previous) || !valid.has(next)) return 'unverified';
  if (previous === 'block_cost' || next === 'block_cost') return 'block_cost';
  if (previous === 'unverified' || next === 'unverified') return 'unverified';
  if (previous === 'free_delivered' || next === 'free_delivered') return 'free_delivered';
  return 'pending';
}
