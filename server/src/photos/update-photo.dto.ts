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

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  altText?: string;

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  seoDescription?: string;

  @IsOptional()
  @IsString()
  keywords?: string;
}

export class EnrichPhotoDto {
  @IsOptional()
  @IsBoolean()
  apply?: boolean;

  @IsOptional()
  @IsBoolean()
  overwriteTitle?: boolean;

  @IsOptional()
  @IsBoolean()
  overwriteCategory?: boolean;

  @IsOptional()
  @IsBoolean()
  fillEmptyFieldNotes?: boolean;
}

export class EnrichAllDto {
  @IsOptional()
  @IsBoolean()
  onlyMissing?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsBoolean()
  overwriteTitle?: boolean;

  @IsOptional()
  @IsBoolean()
  overwriteCategory?: boolean;
}
