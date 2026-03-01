import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayload {
    sub: number;
    email: string;
    nickname: string;
}

export const CurrentUser = createParamDecorator(
    (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
        const request = ctx.switchToHttp().getRequest();
        const user = request.user as JwtPayload;

        return data ? user?.[data] : user;
    },
);