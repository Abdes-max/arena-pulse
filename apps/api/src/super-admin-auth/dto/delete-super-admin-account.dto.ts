import { IsString } from 'class-validator';

export class DeleteSuperAdminAccountDto {
  @IsString()
  password!: string;
}
