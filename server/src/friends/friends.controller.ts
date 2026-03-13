import {Body, Controller, Delete, Get, Param, ParseIntPipe, Post, Query, UseGuards} from "@nestjs/common";
import {JwtAuthGuard} from "../auth/guards/jwt-auth.guard.js";
import {FriendsService} from "./friends.service.js";
import {CurrentUser} from "../auth/decorators/current-user.decorator.js";
import {RespondFriendRequestDto, SendFriendRequestDto} from "./dto/friend.dto.js";

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
    constructor(private readonly friendsService: FriendsService) {}

    @Get()
    getMyFriends(@CurrentUser('sub') userId: number) {
        return this.friendsService.getMyFriends(userId);
    }

    @Get('requests/pending')
    getPending(@CurrentUser('sub') userId: number) {
        return this.friendsService.getPendingRequests(userId);
    }

    @Get('requests/sent')
    getSent(@CurrentUser('sub') userId: number) {
        return this.friendsService.getSentRequests(userId);
    }

    @Get('search')
    search(@CurrentUser('sub') userId: number, @Query('q') q: string) {
        return this.friendsService.searchUsers(userId, q ?? '');
    }

    @Post('request')
    sendRequest(@CurrentUser('sub') userId: number, @Body() dto: SendFriendRequestDto) {
        return this.friendsService.sendRequest(userId, dto.receiverId);
    }

    @Post('respond')
    respond(@CurrentUser('sub') userId: number, @Body() dto: RespondFriendRequestDto) {
        return this.friendsService.respond(userId, dto.friendshipId, dto.action);
    }

    @Delete('cancel/:id')
    cancel(@CurrentUser('sub') userId: number, @Param('id', ParseIntPipe) id: number) {
        return this.friendsService.cancelRequest(userId, id);
    }

    @Delete(':friendId')
    remove(@CurrentUser('sub') userId: number, @Param('friendId', ParseIntPipe) friendId: number) {
        return this.friendsService.removeFriend(userId, friendId);
    }
}