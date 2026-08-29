export const PRICING = Object.freeze({
  currency: "USD",
  trialDays: 3,
  freeTemplateCount: 25,
  monthly: Object.freeze({
    id: "pro_monthly",
    label: "Pro Monthly",
    price: 9.99,
    interval: "month",
  }),
  annual: Object.freeze({
    id: "pro_annual",
    label: "Pro Annual",
    price: 79.99,
    interval: "year",
    savingsLabel: "Save 33%",
  }),
});

export const ENTITLEMENT_STATES = Object.freeze({
  NOT_STARTED: "not_started",
  TRIAL: "trial",
  EXPIRED: "expired",
  PRO_MONTHLY: "pro_monthly",
  PRO_ANNUAL: "pro_annual",
});

export const publicPricing = () => ({
  currency: PRICING.currency,
  trialDays: PRICING.trialDays,
  freeTemplateCount: PRICING.freeTemplateCount,
  monthly: PRICING.monthly,
  annual: PRICING.annual,
});
