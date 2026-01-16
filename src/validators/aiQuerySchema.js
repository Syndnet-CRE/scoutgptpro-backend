import { z } from 'zod';

export const aiQueryRequestSchema = z.object({
  query: z.string()
    .min(1, 'Query cannot be empty')
    .max(2000, 'Query cannot exceed 2000 characters'),
  mode: z.enum(['scout', 'zoning', 'comps', 'site']).optional().default('scout'),
  bounds: z.object({
    north: z.number().min(-90).max(90),
    south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
    west: z.number().min(-180).max(180)
  }).nullable().optional(),
  subject: z.object({
    parcelId: z.string()
  }).nullable().optional()
}).refine(
  (data) => {
    if (data.bounds) {
      return data.bounds.north > data.bounds.south && data.bounds.east > data.bounds.west;
    }
    return true;
  },
  { message: 'Invalid bounds: north must be greater than south, east must be greater than west' }
);

export function validateAiQueryRequest(body) {
  const result = aiQueryRequestSchema.safeParse(body);
  if (!result.success) {
    const errors = result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
    return { valid: false, error: errors };
  }
  return { valid: true, data: result.data };
}
