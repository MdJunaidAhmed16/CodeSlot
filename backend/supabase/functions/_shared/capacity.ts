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
export const USD_PER_SLOT = 1;
