import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CheckoutItemDto {
  @IsInt()
  @Min(1)
  photoId!: number;

  @IsString()
  title!: string;

  @IsString()
  sizeKey!: string;

  @IsInt()
  @Min(1)
  @Max(20)
  qty!: number;
}

export class CheckoutDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CheckoutItemDto)
  items!: CheckoutItemDto[];
}
