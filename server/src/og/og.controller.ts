import {Controller, Get, Query, UseGuards} from "@nestjs/common";
import {JwtAuthGuard} from "../auth/guards/jwt-auth.guard.js";
import {OgService} from "./og.service.js";

@Controller('og')
@UseGuards(JwtAuthGuard)
export class OGController {
    constructor(private readonly og: OgService) {}

    @Get()
    async fetch(@Query('url') url: string) {
        if (!url) return null;
        return this.og.fetch(url);
    }
}