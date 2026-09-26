import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";

import { QuotePreviewDto, QuotesResponseDto } from "./quotes.dto";
import { QuotesService } from "./quotes.service";
import { Public } from "../auth/public.decorator";

@ApiTags("quotes")
@Controller({ path: "quotes", version: "1" })
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  /** POST /api/v1/quotes/preview — vault quotes for a hypothetical claim (public). */
  @Public()
  @Post("preview")
  preview(@Body() body: QuotePreviewDto): Promise<QuotesResponseDto> {
    return this.quotes.preview(body);
  }
}
