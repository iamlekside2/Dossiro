import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../../common/decorators';
import type { AuthUser } from '../../common/types/auth.types';
import { WorkflowService } from './workflow.service';

export class DecisionDto {
  @IsBoolean()
  approve!: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

@ApiTags('workflow')
@Controller('workflow')
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('tasks')
  @ApiOperation({
    summary: 'What is waiting for you, oldest first (WFL-9)',
    description:
      'Includes tasks raised against a role or group you belong to and not yet picked up by '
      + 'anybody, which is how a step assigned to "whoever is unit head" reaches you.',
  })
  tasks(@CurrentUser() user: AuthUser) {
    return this.workflow.myTasks(user);
  }

  @Get('definitions')
  @ApiOperation({
    summary: 'The workflows this tenant has defined',
    description: 'With how many are in flight under each, and how many of those are overdue.',
  })
  definitions(@CurrentUser() user: AuthUser) {
    return this.workflow.definitions(user);
  }

  @Get('definitions/:id/in-flight')
  @ApiOperation({ summary: 'What this workflow currently has running' })
  inFlight(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.inFlight(user, id);
  }

  @Get('instances/:id')
  @ApiOperation({ summary: 'One workflow in flight, with every step and decision' })
  instance(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.workflow.instance(user, id);
  }

  @Post('tasks/:id/decide')
  @ApiOperation({
    summary: 'Approve or reject a task',
    description:
      'Approving advances the instance; the step’s other outstanding tasks are closed, because a '
      + 'step assigned to a role means one of those people rather than all of them. Rejecting '
      + 'stops the whole instance — continuing past a refusal would make the approval decorative.',
  })
  decide(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: DecisionDto) {
    return this.workflow.decide(user, id, dto.approve, dto.comment);
  }
}
