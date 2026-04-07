import { TRPCError } from '@trpc/server';
import { middleware } from '../trpc';
import { Prisma } from '@prisma/client';

/**
 * Audit Middleware Factory
 * Captures before/after snapshots of mutations and logs them to the AuditLog table.
 */
export function createAuditMiddleware(entityName: string) {
  return middleware(async (opts) => {
    // Only audit mutations
    if (opts.type !== 'mutation') {
      return opts.next();
    }

    if (!opts.ctx.user) {
      throw new TRPCError({
        code: 'UNAUTHORIZED',
        message: 'You must be logged in to perform audited actions',
      });
    }

    const input = await opts.getRawInput() as Record<string, any>;
    let entityId: number | null = null;
    let beforeSnapshot: any = null;
    let idKeyToUse: string | null = null;

    // Common ID field patterns based on Schema
    const idKeys = [
      `${entityName.charAt(0).toLowerCase() + entityName.slice(1)}Id`,
      'patientId', 
      'treatmentId', 
      'creditId', 
      'prescriptionId',
      'id'
    ];

    // Try to extract ID from input (useful for updates and deletes)
    if (input && typeof input === 'object') {
      for (const key of idKeys) {
        if (input[key] !== undefined && input[key] !== null) {
          entityId = Number(input[key]);
          idKeyToUse = key;
          break;
        }
      }
    }

    // Try to fetch 'before' snapshot if an ID was found
    if (entityId !== null && idKeyToUse !== null) {
      const modelName = entityName.charAt(0).toLowerCase() + entityName.slice(1);
      const prismaClient = opts.ctx.prisma as any;
      
      // We expect the model name in Prisma Client to match the entityName exactly
      if (prismaClient[modelName] && typeof prismaClient[modelName].findUnique === 'function') {
        try {
          beforeSnapshot = await prismaClient[modelName].findUnique({
            where: { [idKeyToUse]: entityId }
          });
        } catch (e) {
          console.error(`Audit middleware failed to cleanly fetch before snapshot for ${entityName}`, e);
        }
      }
    }

    // Capture the result of the mutation
    const result = await opts.next();

    // After snapshot + log
    if (result.ok) {
      const dbAction = opts.path.split('.').pop() || 'mutation';
      let afterSnapshot: any = null;
      
      // If the action is delete, the after snapshot is empty (null)
      // Otherwise it's what the mutation returned (which should typically be the updated/created entity)
      if (!dbAction.toLowerCase().includes('delete')) {
        afterSnapshot = result.data;
        
        // If it was a create action and we didn't have an ID initially, extract it from the result
        if (entityId === null && result.data && typeof result.data === 'object') {
          for (const key of idKeys) {
            if ((result.data as any)[key] !== undefined) {
              entityId = Number((result.data as any)[key]);
              break;
            }
          }
        }
      }

      try {
        await opts.ctx.prisma.auditLog.create({
          data: {
            userId: opts.ctx.user.userId,
            action: dbAction,
            entity: entityName,
            entityId: entityId || 0,
            before: beforeSnapshot ? (beforeSnapshot as Prisma.InputJsonValue) : Prisma.JsonNull,
            after: afterSnapshot ? (afterSnapshot as Prisma.InputJsonValue) : Prisma.JsonNull,
            // Assuming no IP captured because express layer typically passes it via Context, which isn't there yet
          },
        });
      } catch (logError) {
        console.error('Failed to write audit log:', logError);
      }
    }

    return result;
  });
}
