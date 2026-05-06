import { Injectable } from '@nestjs/common'

@Injectable()
export class WritingAssistantService {
  private localPolish(text: string) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.!?;:])/g, '$1')
      .replace(/(^|[.!?]\s+)([a-z])/g, (match) => match.toUpperCase())
      .trim()
  }

  async improve(body: any) {
    const text = String(body.text || '').trim()
    const context = String(body.context || 'work update').trim()

    if (!text) {
      return { text: '', provider: 'none' }
    }

    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      return {
        text: this.localPolish(text),
        provider: 'local',
      }
    }

    try {
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_WRITING_MODEL || 'gpt-4.1-mini',
          input: [
            {
              role: 'system',
              content:
                'Improve the text for grammar, clarity, and professional tone. Keep the meaning unchanged. Return only the revised text.',
            },
            {
              role: 'user',
              content: `Context: ${context}\n\nText:\n${text}`,
            },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error('Writing assistant provider failed')
      }

      const data: any = await response.json()
      const improved =
        data.output_text ||
        data.output?.[0]?.content?.find((item: any) => item.type === 'output_text')
          ?.text

      return {
        text: String(improved || this.localPolish(text)).trim(),
        provider: 'openai',
      }
    } catch {
      return {
        text: this.localPolish(text),
        provider: 'local',
      }
    }
  }
}
