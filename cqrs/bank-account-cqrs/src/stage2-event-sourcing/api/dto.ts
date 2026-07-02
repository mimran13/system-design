import { IsInt, IsPositive, IsString, MinLength, Min } from 'class-validator';

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

export class TransferDto {
  @IsString()
  @MinLength(1)
  fromAccountId!: string;

  @IsString()
  @MinLength(1)
  toAccountId!: string;

  @IsInt()
  @IsPositive()
  amountMinor!: number;
}
