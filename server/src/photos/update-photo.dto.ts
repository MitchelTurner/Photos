import { IsBoolean, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdatePhotoDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  coord?: string;

  @IsOptional()
  @IsString()
  cond?: string;

  @IsOptional()
  @IsString()
  whenShot?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.4)
  aspectRatio?: number;

  @IsOptional()
  @IsBoolean()
  forSale?: boolean;

  @IsOptional()
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsNumber()
  sortOrder?: number;
}
