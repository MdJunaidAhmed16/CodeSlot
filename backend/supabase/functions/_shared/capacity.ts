// Capacity-gated developer admission.
//
//   capacity = FREE_SLOTS + floor(advertiser_funding / USD_PER_SLOT)
//
// FREE_SLOTS   - developers admitted even with zero advertiser budget (covered
//                by the house/affiliate ads; their ad budgets are the real
//                subsidy cap). The product is never empty on day one.
// USD_PER_SLOT - dollars of live advertiser budget that unlock one extra slot.
//
// These are deliberately plain constants: tune and redeploy `auth` to change the
// growth curve. The hard money ceiling is enforced elsewhere (advertiser budgets
// are prepaid; house-ad budgets cap the subsidy), so these only shape how many
// developers share the available funding.
export const FREE_SLOTS = 10;

// USD_PER_SLOT must equal what ONE developer actually consumes in a MONTH, not
// an arbitrary round number. Budget is a flow (it drains as ads serve); a slot
// is a stock (admission is permanent - there is no un-admit). Dividing the two
// with the wrong constant silently over-admits.
//
// Measured against the live config: an ad rotates every 120s (serve-ad) and a
// single ad credits at most once per 240s (track-event), so a developer credits
// ~15-30 impressions per focused hour at $0.006 each. At the conservative end
// (15/hr, ~4 focused hours/day, ~20 working days) that is ~1,200 impressions =
// ~$7/month; the busy end reaches ~$16. $12 sits between them.
//
// The old value of 1 meant $1 of budget admitted a developer forever, while
// that developer drank the same $1 in under six focused hours - so a $141
// deposit opened the gate for 151 people and emptied in under two days,
// stranding all 151 on an unfunded, non-earning slot.
export const USD_PER_SLOT = 12;
