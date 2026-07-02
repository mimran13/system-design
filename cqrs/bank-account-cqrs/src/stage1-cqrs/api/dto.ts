import { IsInt, IsPositive, IsString, MinLength, Min } from 'class-validator';

/**
 * DTOs (Data Transfer Objects) validate the raw HTTP body at the edge. They are
 * NOT commands — they're the untrusted wire format. The controller maps a
 * validated DTO into a clean command before anything touches the domain. Keeping
 * these separate means the wire format can change without disturbing the domain.
 *
 * Amounts arrive in MINOR units (pence/cents) so the client is explicit and we
 * never have to guess about decimals.
 */
export class OpenAccountDto {
  @IsString()
  @MinLength(1)
  owner!: string;

  @IsInt()
  @Min(0)
  openingBalanceMinor!: number;
}

export class AmountDto {
  @IsInt()
  @IsPositive()
  amountMinor!: number;
}
