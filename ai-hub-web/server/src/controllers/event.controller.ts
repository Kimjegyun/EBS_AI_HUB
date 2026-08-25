import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';

export class EventController {
  async getEvents(req: AuthRequest, res: Response) {
    res.json([]);
  }
  async createEvent(req: AuthRequest, res: Response) {
    res.json({ message: 'Event created' });
  }
  async updateEvent(req: AuthRequest, res: Response) {
    res.json({ message: 'Event updated' });
  }
  async deleteEvent(req: AuthRequest, res: Response) {
    res.json({ message: 'Event deleted' });
  }
}
