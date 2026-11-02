import { z } from 'zod';

export const curriculumTopicSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(250),
  status: z.enum(['auto', 'planned', 'learning', 'mastered']).default('auto'),
  materialIds: z.array(z.uuid()).max(20).default([]),
});
export const curriculumSchema = z
  .object({
    version: z.literal(1).default(1),
    lessonsPerWeek: z.number().int().min(1).max(7).nullable().default(null),
    duration: z.number().int().min(15).max(240).nullable().default(null),
    blocks: z
      .array(
        z.object({
          id: z.uuid(),
          title: z.string().trim().min(1).max(250),
          topics: z.array(curriculumTopicSchema).max(100),
        }),
      )
      .max(30),
  })
  .superRefine((program, ctx) => {
    const ids = new Set<string>();
    let topics = 0;
    for (const [index, block] of program.blocks.entries()) {
      if (ids.has(block.id))
        ctx.addIssue({
          code: 'custom',
          path: ['blocks', index, 'id'],
          message: 'Повторяется идентификатор раздела',
        });
      ids.add(block.id);
      topics += block.topics.length;
      for (const [position, topic] of block.topics.entries()) {
        if (ids.has(topic.id))
          ctx.addIssue({
            code: 'custom',
            path: ['blocks', index, 'topics', position, 'id'],
            message: 'Повторяется идентификатор темы',
          });
        ids.add(topic.id);
      }
    }
    if (topics > 500)
      ctx.addIssue({
        code: 'custom',
        path: ['blocks'],
        message: 'В программе может быть не больше 500 тем',
      });
  });

export type StudentCurriculum = z.infer<typeof curriculumSchema>;
export type CurriculumTopic = z.infer<typeof curriculumTopicSchema>;
