import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { NoStoreInterceptor } from '../../common/interceptors/no-store.interceptor.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import {
  MatchStatementDto,
  QrDecisionDto,
  QrEvidenceDto,
  QrListDto,
  QrMerchantDto,
  SubmitQrDto,
} from './dto/qr-claim.dto.js';
import { QrClaimsService } from './qr-claims.service.js';

const upload = FileInterceptor('image', {
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 7, fieldSize: 8192 },
});
function sendImage(res: Response, image: Uint8Array) {
  res
    .set({
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    })
    .type('png')
    .send(Buffer.from(image));
}

@Controller('portal/children/:studentId/qr')
@RequirePermissions('portal:access')
@UseInterceptors(NoStoreInterceptor)
export class FamilyQrController {
  constructor(private service: QrClaimsService) {}
  @Get() options(
    @CurrentUser() actor: AuthUser,
    @Param('studentId', ParseUUIDPipe) child: string,
  ) {
    return this.service.options(actor, child);
  }
  @Get('code/:id') async code(
    @CurrentUser() actor: AuthUser,
    @Param('studentId', ParseUUIDPipe) child: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ) {
    await this.service.child(actor, child);
    sendImage(res, await this.service.qrImage(id, true));
  }
  @Get('claims') async list(
    @CurrentUser() actor: AuthUser,
    @Param('studentId', ParseUUIDPipe) child: string,
    @Query() q: QrListDto,
  ) {
    return this.service.list(q, await this.service.child(actor, child));
  }
  @Post('claims')
  @UseInterceptors(upload)
  @Throttle({ default: { limit: 12, ttl: 60000 } })
  submit(
    @CurrentUser() actor: AuthUser,
    @Param('studentId', ParseUUIDPipe) child: string,
    @Body() dto: SubmitQrDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.submit(actor, child, dto, file);
  }
  @Post('claims/:id/evidence')
  @UseInterceptors(upload)
  supplement(
    @CurrentUser() actor: AuthUser,
    @Param('studentId', ParseUUIDPipe) child: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QrEvidenceDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.supplement(actor, child, id, dto, file);
  }
  @Get('claims/:id/evidence/:event') async proof(
    @CurrentUser() actor: AuthUser,
    @Param('studentId', ParseUUIDPipe) child: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('event', ParseUUIDPipe) event: string,
    @Res() res: Response,
  ) {
    sendImage(
      res,
      await this.service.image(
        id,
        event,
        await this.service.child(actor, child),
      ),
    );
  }
}

@Controller('fees/qr')
@UseInterceptors(NoStoreInterceptor)
export class FinanceQrController {
  constructor(private service: QrClaimsService) {}
  @Get('configuration')
  @RequirePermissions('fees:qr-manage')
  config() {
    return this.service.active();
  }
  @Post('configuration')
  @RequirePermissions('fees:qr-manage')
  @UseInterceptors(upload)
  configure(
    @CurrentUser() actor: AuthUser,
    @Body() dto: QrMerchantDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.configure(actor, dto.merchant, file);
  }
  @Post('disable')
  @RequirePermissions('fees:qr-manage')
  disable(@CurrentUser() actor: AuthUser) {
    return this.service.configure(actor);
  }
  @Get('configuration/:id/image')
  @RequirePermissions('fees:qr-manage')
  async code(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    sendImage(res, await this.service.qrImage(id, false));
  }
  @Get('claims')
  @RequirePermissions('fees:qr-review')
  list(@Query() q: QrListDto) {
    return this.service.list(q);
  }
  @Post('reconcile') @RequirePermissions('fees:qr-review') match(
    @Body() dto: MatchStatementDto,
  ) {
    return this.service.reconcile(dto);
  }
  @Get('claims/:id/dues') @RequirePermissions('fees:qr-review') dues(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.familyDues(id);
  }
  @Post('claims/:id/decision')
  @RequirePermissions('fees:qr-review')
  decide(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: QrDecisionDto,
  ) {
    return this.service.decide(actor, id, dto);
  }
  @Get('claims/:id/evidence/:event')
  @RequirePermissions('fees:qr-review')
  async proof(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('event', ParseUUIDPipe) event: string,
    @Res() res: Response,
  ) {
    sendImage(res, await this.service.image(id, event));
  }
}
