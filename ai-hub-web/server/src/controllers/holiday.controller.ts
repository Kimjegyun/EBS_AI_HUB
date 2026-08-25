import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';

export class HolidayController {
  async getHolidays(req: AuthRequest, res: Response) {
    res.json([]);
  }
  async createHoliday(req: AuthRequest, res: Response) {
    res.json({ message: 'Holiday created' });
  }
  async updateHoliday(req: AuthRequest, res: Response) {
    res.json({ message: 'Holiday updated' });
  }
  async deleteHoliday(req: AuthRequest, res: Response) {
    res.json({ message: 'Holiday deleted' });
  }
}
