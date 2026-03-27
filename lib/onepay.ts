import crypto from 'crypto';

// OnePay (VN VPC) helper utilities
// Docs typically require: sort params (vpc_* only, non-empty), build query string, HMAC-SHA256 over key=value&..., hex uppercase

export type OnepayConfig = {
    paymentUrl: string; // e.g. https://onepay.vn/vpcpay/vpcpay.op
    merchant: string; // ONEPAY_VPC_MERCHANT
    accessCode: string; // ONEPAY_VPC_ACCESS_CODE
    secureSecret: string; // ONEPAY_VPC_SECURE_SECRET (hex preferred)
};

export type CreatePaymentParams = {
    amount: number; // in VND, NOT multiplied (we will multiply by 100 internally)
    merchTxnRef: string; // unique reference (use reservation_payment.id)
    orderInfo: string; // brief description
    returnURL: string; // absolute URL
    ipnURL?: string; // optional notify URL
    currency?: string; // default VND
    locale?: string; // default 'vn'
};

export function getOnepayConfigFromEnv(): OnepayConfig | null {
    const paymentUrl = process.env.ONEPAY_VPC_PAYMENT_URL || '';
    const merchant = process.env.ONEPAY_VPC_MERCHANT || '';
    const accessCode = process.env.ONEPAY_VPC_ACCESS_CODE || '';
    const secureSecret = process.env.ONEPAY_VPC_SECURE_SECRET || '';
    if (!paymentUrl || !merchant || !accessCode || !secureSecret) return null;
    return { paymentUrl, merchant, accessCode, secureSecret };
}

function isHex(str: string) {
    return /^[0-9a-fA-F]+$/.test(str);
}

export function createSecureHash(params: Record<string, string>, secureSecret: string) {
    // Filter vpc_ keys, exclude SecureHash & Type, only non-empty
    const keys = Object.keys(params)
        .filter(k => k.startsWith('vpc_') && k !== 'vpc_SecureHash' && k !== 'vpc_SecureHashType' && params[k] !== undefined && params[k] !== null && params[k] !== '')
        .sort();
    const queryString = keys.map(k => `${k}=${params[k]}`).join('&');
    const key = isHex(secureSecret) ? Buffer.from(secureSecret, 'hex') : secureSecret;
    const hmac = crypto.createHmac('sha256', key as any).update(queryString, 'utf8').digest('hex').toUpperCase();
    return hmac;
}

export function buildOnepayUrl(cfg: OnepayConfig, p: CreatePaymentParams) {
    const params: Record<string, string> = {
        vpc_Version: '2',
        vpc_Command: 'pay',
        vpc_AccessCode: cfg.accessCode,
        vpc_Merchant: cfg.merchant,
        vpc_Locale: p.locale || 'vn',
        vpc_ReturnURL: p.returnURL,
        vpc_MerchTxnRef: p.merchTxnRef,
        vpc_OrderInfo: p.orderInfo,
        vpc_Amount: String(Math.round((p.amount || 0) * 100)),
        vpc_Currency: p.currency || 'VND',
    };

    if (p.ipnURL) {
        (params as any).vpc_NotifyURL = p.ipnURL;
    }

    const vpc_SecureHash = createSecureHash(params, cfg.secureSecret);
    const finalParams = new URLSearchParams({ ...params, vpc_SecureHash, vpc_SecureHashType: 'SHA256' });
    return `${cfg.paymentUrl}?${finalParams.toString()}`;
}

export function verifyOnepayHash(allParams: URLSearchParams, secureSecret: string) {
    const obj: Record<string, string> = {};
    allParams.forEach((v, k) => {
        obj[k] = v;
    });
    const received = obj['vpc_SecureHash'] || '';
    const calc = createSecureHash(obj, secureSecret);
    return received.toUpperCase() === calc.toUpperCase();
}

export function getBaseSiteUrl() {
    // Prefer explicit
    const explicit = process.env.ONEPAY_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
    if (explicit) return explicit.replace(/\/$/, '');
    // Vercel env
    if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
    // Fallback local
    return 'http://localhost:3000';
}
