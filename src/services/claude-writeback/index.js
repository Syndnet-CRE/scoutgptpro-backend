/**
 * Claude Write-Back Service
 * Handles persistence of Claude conversations, enrichments, and training data
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Create a new Claude session
 * @param {Object} params
 * @param {string} [params.sessionId] - Optional session ID to link with
 * @param {string} [params.userId] - Optional user ID
 * @param {string} [params.model] - Model name
 * @param {string} [params.systemPrompt] - System prompt used
 * @returns {Promise<Object>} Created session
 */
export async function createClaudeSession({ sessionId, userId, model, systemPrompt }) {
  return prisma.claudeSession.create({
    data: {
      sessionId,
      userId,
      model: model || 'claude-sonnet-4-20250514',
      systemPrompt,
      metadata: {}
    }
  });
}

/**
 * Add a message to a Claude session
 * @param {Object} params
 * @param {string} params.claudeSessionId - Claude session ID
 * @param {string} params.role - 'user' | 'assistant' | 'system'
 * @param {string} params.content - Message content
 * @param {Array} [params.toolUses] - Tool use blocks (for assistant messages)
 * @param {Array} [params.toolResults] - Tool results (for user messages)
 * @param {number} [params.inputTokens] - Input token count
 * @param {number} [params.outputTokens] - Output token count
 * @returns {Promise<Object>} Created message
 */
export async function addClaudeMessage({
  claudeSessionId,
  role,
  content,
  toolUses,
  toolResults,
  inputTokens,
  outputTokens
}) {
  // Get current message count for this session
  const session = await prisma.claudeSession.findUnique({
    where: { id: claudeSessionId },
    select: { messageCount: true }
  });

  if (!session) {
    throw new Error(`Claude session not found: ${claudeSessionId}`);
  }

  const messageIndex = session.messageCount;

  // Create message and update session counts atomically
  const [message] = await prisma.$transaction([
    prisma.claudeMessage.create({
      data: {
        claudeSessionId,
        messageIndex,
        role,
        content,
        toolUses,
        toolResults,
        inputTokens,
        outputTokens
      }
    }),
    prisma.claudeSession.update({
      where: { id: claudeSessionId },
      data: {
        messageCount: { increment: 1 },
        toolUseCount: toolUses ? { increment: toolUses.length } : undefined,
        totalTokens: { increment: (inputTokens || 0) + (outputTokens || 0) }
      }
    })
  ]);

  return message;
}

/**
 * Store a parcel enrichment discovered by Claude
 * @param {Object} params
 * @param {string} params.parcelId - Parcel ID
 * @param {string} [params.claudeSessionId] - Claude session that discovered this
 * @param {string} params.enrichmentType - Type of enrichment
 * @param {Object} params.enrichmentData - Enrichment data
 * @param {number} [params.confidenceScore] - Confidence score (0-1)
 * @param {string} [params.sourceTool] - Tool that generated this
 * @returns {Promise<Object>} Created enrichment
 */
export async function storeParcelEnrichment({
  parcelId,
  claudeSessionId,
  enrichmentType,
  enrichmentData,
  confidenceScore,
  sourceTool
}) {
  return prisma.parcelEnrichment.create({
    data: {
      parcelId,
      claudeSessionId,
      enrichmentType,
      enrichmentData,
      confidenceScore,
      sourceTool
    }
  });
}

/**
 * End a Claude session
 * @param {string} claudeSessionId - Claude session ID
 * @returns {Promise<Object>} Updated session
 */
export async function endClaudeSession(claudeSessionId) {
  return prisma.claudeSession.update({
    where: { id: claudeSessionId },
    data: {
      endedAt: new Date()
    }
  });
}

/**
 * Get a Claude session with all messages
 * @param {string} claudeSessionId - Claude session ID
 * @returns {Promise<Object>} Session with messages
 */
export async function getClaudeSession(claudeSessionId) {
  return prisma.claudeSession.findUnique({
    where: { id: claudeSessionId },
    include: {
      messages: {
        orderBy: { messageIndex: 'asc' }
      },
      enrichments: true
    }
  });
}

/**
 * Export sessions as JSONL for training
 * @param {Object} params
 * @param {string[]} [params.sessionIds] - Specific session IDs to export
 * @param {Date} [params.startDate] - Start date filter
 * @param {Date} [params.endDate] - End date filter
 * @param {string} [params.exportedBy] - User triggering export
 * @returns {Promise<{jsonl: string, log: Object}>} JSONL content and export log
 */
export async function exportTrainingData({
  sessionIds,
  startDate,
  endDate,
  exportedBy
}) {
  // Build query filter
  const where = {};
  
  if (sessionIds && sessionIds.length > 0) {
    where.id = { in: sessionIds };
  }
  
  if (startDate || endDate) {
    where.startedAt = {};
    if (startDate) where.startedAt.gte = startDate;
    if (endDate) where.startedAt.lte = endDate;
  }

  // Fetch sessions with messages
  const sessions = await prisma.claudeSession.findMany({
    where,
    include: {
      messages: {
        orderBy: { messageIndex: 'asc' }
      }
    }
  });

  // Convert to JSONL format
  const jsonlLines = sessions.map(session => {
    const messages = session.messages.map(m => ({
      role: m.role,
      content: m.content,
      ...(m.toolUses && { tool_uses: m.toolUses }),
      ...(m.toolResults && { tool_results: m.toolResults })
    }));

    return JSON.stringify({
      messages,
      metadata: {
        session_id: session.id,
        model: session.model,
        started_at: session.startedAt.toISOString(),
        message_count: session.messageCount,
        tool_use_count: session.toolUseCount
      }
    });
  });

  const jsonl = jsonlLines.join('\n');
  const messageCount = sessions.reduce((sum, s) => sum + s.messageCount, 0);

  // Create export log
  const log = await prisma.trainingExportLog.create({
    data: {
      exportType: 'conversation',
      sessionIds: sessions.map(s => s.id),
      dateRangeStart: startDate,
      dateRangeEnd: endDate,
      messageCount,
      fileSizeBytes: Buffer.byteLength(jsonl, 'utf8'),
      exportedBy,
      metadata: {
        sessionCount: sessions.length
      }
    }
  });

  return { jsonl, log };
}

export default {
  createClaudeSession,
  addClaudeMessage,
  storeParcelEnrichment,
  endClaudeSession,
  getClaudeSession,
  exportTrainingData
};
