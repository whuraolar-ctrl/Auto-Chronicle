import Decimal from 'decimal.js';

function minorUnitFactor(currency: string): number {
    const digits = new Intl.NumberFormat('en', {
        style: 'currency',
        currency,
    }).resolvedOptions().maximumFractionDigits ?? 2;

    return 10 ** digits;
}

export function toMinor(amount: number | string, currency: string): number {
    const minor = new Decimal(amount)
        .mul(minorUnitFactor(currency))
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    if (!minor.isInteger() || minor.abs().greaterThan(Number.MAX_SAFE_INTEGER)) {
        throw new RangeError('Money amount exceeds the safe integer range');
    }

    return minor.toNumber();
}

export function fromMinor(minor: number, currency: string): number {
    return new Decimal(minor).div(minorUnitFactor(currency)).toNumber();
}

/** Converts integer minor units using a rate expressed as target. */
export function convertMinor(
    minor: number,
    rate: number | string,
    sourceCurrency: string,
    targetCurrency: string,
): number {
    const converted = new Decimal(minor)
        .mul(String(rate))
        .mul(minorUnitFactor(targetCurrency))
        .div(minorUnitFactor(sourceCurrency))
        .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    if (
        !converted.isInteger() ||
        converted.abs().greaterThan(Number.MAX_SAFE_INTEGER)
    ) {
        throw new RangeError('Converted amount exceeds the safe integer range');
    }

    return converted.toNumber();
}