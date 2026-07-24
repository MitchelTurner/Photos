import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { AdminGuard } from './admin.guard';
import { PhotosService } from './photos.service';
import { UpdatePhotoDto } from './update-photo.dto';
import { photoMulterOptions } from './upload.config';

type UploadBody = {
  title?: string;
  category?: string;
  coord?: string;
  cond?: string;
  whenShot?: string;
  aspectRatio?: string;
  forSale?: string;
  published?: string;
};

@Controller()
export class PhotosController {
  constructor(private readonly photos: PhotosService) {}

  /** Public gallery feed */
  @Get('photos')
  listPublished() {
    return this.photos.listPublished();
  }

  /** Admin: full list including unpublished */
  @Get('admin/photos')
  @UseGuards(AdminGuard)
  listAdmin() {
    return this.photos.listAllAdmin();
  }

  /** Admin: upload a photo for sale / gallery */
  @Post('admin/photos')
  @UseGuards(AdminGuard)
  @UseInterceptors(FileInterceptor('file', photoMulterOptions))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: UploadBody,
  ) {
    return this.photos.createFromUpload(file, body);
  }

  /** Admin: bulk upload (titles derived from each filename) */
  @Post('admin/photos/bulk')
  @UseGuards(AdminGuard)
  @UseInterceptors(FilesInterceptor('files', 40, photoMulterOptions))
  bulkUpload(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: UploadBody,
  ) {
    return this.photos.createManyFromUpload(files, body);
  }

  @Patch('admin/photos/:id')
  @UseGuards(AdminGuard)
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdatePhotoDto,
  ) {
    return this.photos.update(id, body);
  }

  @Delete('admin/photos/:id')
  @UseGuards(AdminGuard)
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.photos.remove(id);
  }
}
