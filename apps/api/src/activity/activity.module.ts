import { Module } from "@nestjs/common";

import { ActivityController } from "./activity.controller";
import { ActivityService } from "./activity.service";
import { CursorModule } from "../cursor/cursor.module";

@Module({
  imports: [CursorModule],
  controllers: [ActivityController],
  providers: [ActivityService],
})
export class ActivityModule {}
