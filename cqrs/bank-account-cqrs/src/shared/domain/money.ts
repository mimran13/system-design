/**
 * Money — a Value Object.
 *
 * A Value Object has NO identity. Two Money instances of 500 cents are equal,
 * full stop — there's no "which £5" the way there's a "which account".
 *
 * Two hard rules this class enforces so the rest of the codebase can relax:
 *   1. Money is stored as an integer number of MINOR units (pence/cents).
 *      Never floats. `0.1 + 0.2 !== 0.3` in floating point, and that rounding
 *      error becomes a real missing penny in a ledger. Integers can't drift.
 *   2. Money is IMMUTABLE. Every operation returns a NEW Money. You can hand a
 *      Money to anyone and know they can't mutate your balance behind your back.
 */
export class Money {
  private constructor(private readonly minorUnits: number) {}

  /** Build from whole currency units, e.g. Money.fromMajor(10.5) === £10.50. */
  static fromMajor(major: number): Money {
    if (!Number.isFinite(major)) {
      throw new Error('Money.fromMajor requires a finite number');
    }
    // Round to the nearest minor unit so 10.505 can't sneak in a third decimal.
    return new Money(Math.round(major * 100));
  }

  /** Build straight from minor units (pence/cents). This is what we persist. */
  static fromMinor(minorUnits: number): Money {
    if (!Number.isInteger(minorUnits)) {
      throw new Error('Money.fromMinor requires an integer number of minor units');
    }
    return new Money(minorUnits);
  }

  static zero(): Money {
    return new Money(0);
  }

  add(other: Money): Money {
    return new Money(this.minorUnits + other.minorUnits);
  }

  subtract(other: Money): Money {
    return new Money(this.minorUnits - other.minorUnits);
  }

  isNegative(): boolean {
    return this.minorUnits < 0;
  }

  isZeroOrLess(): boolean {
    return this.minorUnits <= 0;
  }

  isGreaterThan(other: Money): boolean {
    return this.minorUnits > other.minorUnits;
  }

  equals(other: Money): boolean {
    return this.minorUnits === other.minorUnits;
  }

  /** The canonical persisted form. Events and repositories store this. */
  toMinor(): number {
    return this.minorUnits;
  }

  toMajor(): number {
    return this.minorUnits / 100;
  }

  toString(): string {
    return this.toMajor().toFixed(2);
  }
}
