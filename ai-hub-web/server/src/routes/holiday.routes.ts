import { Router } from 'express';
import { HolidayController } from '../controllers/holiday.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
const controller = new HolidayController();

router.use(authenticate);
router.get('/', controller.getHolidays);
router.post('/', authorize('admin'), controller.createHoliday);
router.put('/:id', authorize('admin'), controller.updateHoliday);
router.delete('/:id', authorize('admin'), controller.deleteHoliday);

export default router;
