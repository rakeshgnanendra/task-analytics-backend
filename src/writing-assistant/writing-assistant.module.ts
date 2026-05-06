import { Module } from '@nestjs/common'
import { WritingAssistantController } from './writing-assistant.controller'
import { WritingAssistantService } from './writing-assistant.service'

@Module({
  controllers: [WritingAssistantController],
  providers: [WritingAssistantService],
})
export class WritingAssistantModule {}
