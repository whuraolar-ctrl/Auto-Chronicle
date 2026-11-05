import { Matches } from 'class-validator';

export class VerifyPaymentQueryDto {
  /** Our own payment reference, for example AC-3f2c... Anything else is. */
  @Matches(/^AC-[A-Za-z0-9-]{8,80}$/, { message: 'reference is not valid' })
  reference: string;
}