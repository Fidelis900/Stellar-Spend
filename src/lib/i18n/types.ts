export type Language = 'en' | 'es' | 'fr' | 'zh' | 'ar' | 'pt' | 'sw';

export interface TranslationKeys {
  common: {
    loading: string;
    error: string;
    success: string;
    cancel: string;
    submit: string;
    close: string;
  };
  navigation: {
    home: string;
    history: string;
    settings: string;
  };
  offramp: {
    title: string;
    enterAmount: string;
    selectCurrency: string;
    selectBank: string;
    accountNumber: string;
    estimatedTime: string;
    fees: string;
    total: string;
  };
  errors: {
    invalidAmount: string;
    insufficientBalance: string;
    networkError: string;
    transactionFailed: string;
  };
  loyalty: {
    title: string;
    tier: string;
    points_balance: string;
    lifetime_points: string;
    progress_to: string;
    remaining: string;
    exclusive_benefits: string;
    multipliers_limits: string;
    points_multiplier: string;
    fee_discount: string;
    withdrawal_limit: string;
    redeem: string;
    custom_redemption: string;
    min_points: string;
    upgrade_title: string;
    new_benefits_unlocked: string;
  };
  referral: {
    title: string;
    your_code: string;
    copy: string;
    copied: string;
    copy_link: string;
    share: string;
    generate_code: string;
    total_referrals: string;
    total_rewards: string;
    completed: string;
    pending: string;
    conversion_rate: string;
    history_empty: string;
    leaderboard_empty: string;
    you: string;
    reward: string;
  };
  insurance: {
    title: string;
    description: string;
    terms: string;
    terms_title: string;
    coverage: string;
    premium: string;
    provider: string;
    risk_score: string;
    expires: string;
    claim_title: string;
    claim_reason: string;
    evidence: string;
    evidence_placeholder: string;
    file_claim: string;
    eligibility_check: string;
    eligible: string;
    ineligible: string;
    upload_document: string;
    preview: string;
  };
  dispute: {
    title: string;
    reason: string;
    description: string;
    submit: string;
    status: string;
    created: string;
    resolution_notes: string;
    sla_notice: string;
  };
  settings: {
    title: string;
    profile: string;
    appearance: string;
    preferences: string;
    security: string;
    notifications: string;
    language: string;
    currency: string;
    theme: string;
    dark: string;
    light: string;
    system: string;
    kyc_status: string;
    limits: string;
    reset: string;
    save: string;
    saved: string;
    email_notifications: string;
    push_notifications: string;
    sync_account: string;
  };
  receipt: {
    title: string;
    date: string;
    txHash: string;
    orderId: string;
    provider: string;
    exchangeRate: string;
    bridgeFee: string;
    payoutFee: string;
    bank: string;
    account: string;
    print: string;
    share: string;
    viewExplorer: string;
    showQr: string;
    hideQr: string;
  };
}
