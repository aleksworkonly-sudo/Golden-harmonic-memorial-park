'use strict';
// "total_over_term_v2": the monthly amount is the plan total divided by the number of months
// (exactly as printed on the price list). The reservation deposit is credited against the
// total, so the plan simply finishes a few months early; the last payment is the remainder.
const V1 = 'remaining_after_deposit_v1';
const V2 = 'total_over_term_v2';
const monthlyCentavos = (totalCentavos, months) => Math.round(totalCentavos / months);
function v2Schedule(totalCentavos, fundedCentavos, months) {
  const monthly = monthlyCentavos(totalCentavos, months);
  const remaining = Math.max(0, totalCentavos - fundedCentavos);
  const count = remaining > 0 && monthly > 0 ? Math.min(months, Math.ceil(remaining / monthly)) : 0;
  const last = count ? remaining - monthly * (count - 1) : 0;
  return { monthly, remaining, count, last };
}
module.exports = { V1, V2, monthlyCentavos, v2Schedule };
