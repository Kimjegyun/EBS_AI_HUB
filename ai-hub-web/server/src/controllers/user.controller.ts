import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { UserService } from '../services/user.service';

const userService = new UserService();

function canAccessUser(req: AuthRequest, id: string): boolean {
  return req.user?.id === id || req.user?.role === 'admin';
}

export class UserController {
  async getUsers(req: AuthRequest, res: Response) {
    try {
      const users = userService.getUsers();
      res.json(users);
    } catch {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async getUserById(req: AuthRequest, res: Response) {
    try {
      if (!canAccessUser(req, req.params.id)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      const user = await userService.getUserById(req.params.id);
      if (!user) return res.status(404).json({ error: 'User not found' });
      res.json(user);
    } catch {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async updateUser(req: AuthRequest, res: Response) {
    try {
      if (!canAccessUser(req, req.params.id)) {
        return res.status(403).json({ error: 'Insufficient permissions' });
      }
      const user = await userService.updateUser(req.params.id, req.body);
      res.json(user);
    } catch {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async deleteUser(req: AuthRequest, res: Response) {
    try {
      const result = userService.deleteUser(req.params.id);
      res.json(result);
    } catch {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async approveUser(req: AuthRequest, res: Response) {
    try {
      const user = userService.approveUser(req.params.id);
      res.json(user);
    } catch {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }

  async rejectUser(req: AuthRequest, res: Response) {
    try {
      const user = userService.rejectUser(req.params.id);
      res.json(user);
    } catch {
      res.status(500).json({ error: 'Internal Server Error' });
    }
  }
}
