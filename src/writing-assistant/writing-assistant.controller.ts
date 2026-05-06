import { Body, Controller, Post, UseGuards } from '@nestjs/common'
import { JwtAuthGuard } from 'src/auth/jwt-auth.guard'
import { WritingAssistantService } from './writing-assistant.service'

@Controller('writing-assistant')
@UseGuards(JwtAuthGuard)
export class WritingAssistantController {
  constructor(private readonly service: WritingAssistantService) {}

  @Post('improve')
  improve(@Body() body: any) {
    return this.service.improve(body)
  }
}
