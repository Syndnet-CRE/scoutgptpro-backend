import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

// Helper function to validate deal exists
const validateDeal = async (dealId) => {
  const deal = await prisma.deal.findUnique({
    where: { id: dealId },
    select: { id: true }
  });
  if (!deal) {
    throw new Error('Deal not found');
  }
  return deal;
};

// GET /api/deals/:dealId/tasks - List tasks for a deal
router.get('/:dealId/tasks', async (req, res) => {
  try {
    const { dealId } = req.params;
    const { status, priority } = req.query;
    
    // Validate deal exists
    await validateDeal(dealId);
    
    const where = { dealId };
    if (status) {
      // Validate status is a valid TaskStatus enum value
      const validStatuses = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
      if (!validStatuses.includes(status.toUpperCase())) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
      where.status = status.toUpperCase();
    }
    if (priority) {
      // Validate priority is a valid Priority enum value
      const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
      if (!validPriorities.includes(priority.toUpperCase())) {
        return res.status(400).json({ error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` });
      }
      where.priority = priority.toUpperCase();
    }
    
    const tasks = await prisma.task.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    
    res.json(tasks);
  } catch (error) {
    console.error('[Tasks] List error:', error);
    if (error.message === 'Deal not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
});

// POST /api/deals/:dealId/tasks - Create new task
router.post('/:dealId/tasks', async (req, res) => {
  try {
    const { dealId } = req.params;
    const { userId, title, description, dueDate, priority } = req.body;
    
    if (!userId || !title) {
      return res.status(400).json({ error: 'userId and title are required' });
    }
    
    // Validate deal exists
    await validateDeal(dealId);
    
    // Validate priority if provided
    if (priority) {
      const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
      if (!validPriorities.includes(priority.toUpperCase())) {
        return res.status(400).json({ error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` });
      }
    }
    
    const task = await prisma.task.create({
      data: {
        userId,
        dealId,
        title,
        description: description || null,
        dueDate: dueDate ? new Date(dueDate) : null,
        priority: priority ? priority.toUpperCase() : 'MEDIUM',
        status: 'TODO'
      }
    });
    
    res.status(201).json(task);
  } catch (error) {
    console.error('[Tasks] Create error:', error);
    if (error.message === 'Deal not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to create task' });
  }
});

// PATCH /api/deals/:dealId/tasks/:taskId - Update task
router.patch('/:dealId/tasks/:taskId', async (req, res) => {
  try {
    const { dealId, taskId } = req.params;
    const { title, description, dueDate, priority, status } = req.body;
    
    // Validate deal exists
    await validateDeal(dealId);
    
    // Check if task exists and belongs to this deal
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId }
    });
    
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (existingTask.dealId !== dealId) {
      return res.status(400).json({ error: 'Task does not belong to this deal' });
    }
    
    // Validate priority if provided
    if (priority) {
      const validPriorities = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
      if (!validPriorities.includes(priority.toUpperCase())) {
        return res.status(400).json({ error: `Invalid priority. Must be one of: ${validPriorities.join(', ')}` });
      }
    }
    
    // Validate status if provided
    if (status) {
      const validStatuses = ['TODO', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
      if (!validStatuses.includes(status.toUpperCase())) {
        return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
      }
    }
    
    // Build update data
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description || null;
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
    if (priority !== undefined) updateData.priority = priority.toUpperCase();
    if (status !== undefined) {
      updateData.status = status.toUpperCase();
      // Set completedAt when status is COMPLETED, clear it otherwise
      if (status.toUpperCase() === 'COMPLETED' && existingTask.status !== 'COMPLETED') {
        updateData.completedAt = new Date();
      } else if (status.toUpperCase() !== 'COMPLETED' && existingTask.status === 'COMPLETED') {
        updateData.completedAt = null;
      }
    }
    
    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData
    });
    
    res.json(task);
  } catch (error) {
    console.error('[Tasks] Update error:', error);
    if (error.message === 'Deal not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to update task' });
  }
});

// PATCH /api/deals/:dealId/tasks/:taskId/toggle - Toggle task status
router.patch('/:dealId/tasks/:taskId/toggle', async (req, res) => {
  try {
    const { dealId, taskId } = req.params;
    
    // Validate deal exists
    await validateDeal(dealId);
    
    // Check if task exists and belongs to this deal
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId }
    });
    
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (existingTask.dealId !== dealId) {
      return res.status(400).json({ error: 'Task does not belong to this deal' });
    }
    
    // Toggle between TODO and COMPLETED
    const newStatus = existingTask.status === 'TODO' ? 'COMPLETED' : 'TODO';
    const updateData = {
      status: newStatus
    };
    
    // Set completedAt when completing, clear when uncompleting
    if (newStatus === 'COMPLETED') {
      updateData.completedAt = new Date();
    } else {
      updateData.completedAt = null;
    }
    
    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData
    });
    
    res.json(task);
  } catch (error) {
    console.error('[Tasks] Toggle error:', error);
    if (error.message === 'Deal not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to toggle task' });
  }
});

// DELETE /api/deals/:dealId/tasks/:taskId - Delete task
router.delete('/:dealId/tasks/:taskId', async (req, res) => {
  try {
    const { dealId, taskId } = req.params;
    
    // Validate deal exists
    await validateDeal(dealId);
    
    // Check if task exists and belongs to this deal
    const existingTask = await prisma.task.findUnique({
      where: { id: taskId }
    });
    
    if (!existingTask) {
      return res.status(404).json({ error: 'Task not found' });
    }
    
    if (existingTask.dealId !== dealId) {
      return res.status(400).json({ error: 'Task does not belong to this deal' });
    }
    
    await prisma.task.delete({
      where: { id: taskId }
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Tasks] Delete error:', error);
    if (error.message === 'Deal not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to delete task' });
  }
});

export default router;
