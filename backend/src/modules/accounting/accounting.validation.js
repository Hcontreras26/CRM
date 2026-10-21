import { z } from 'zod';

// Los esquemas de egresos se fueron con su modulo (`modules/expenses`, #227).

export const accountingDashboardSchema = z.object({
  projectId: z.coerce.number().int().positive().optional(),
  // Una sociedad entera (CEDIA y sus siete campus). Sin esto, el panel de
  // Finanzas solo sabia mirar un campus.
  issuerId: z.coerce.number().int().positive().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});
