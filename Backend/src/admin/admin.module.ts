import { Module } from "@nestjs/common";
import { AdminController } from "./admin.contoller";
import { AdminGuard } from "./admin.guard";
import { AdminService } from "./admin.service";

@Module({
    controllers: [AdminController],
    providers: [AdminService, AdminGuard],
})
export class AdminModule {}