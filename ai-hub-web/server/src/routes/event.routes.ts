import { Router } from 'express';
import { EventController } from '../controllers/event.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
const controller = new EventController();

router.use(authenticate);
router.get('/', controller.getEvents);
router.post('/', controller.createEvent);
router.put('/:id', controller.updateEvent);
router.delete('/:id', controller.deleteEvent);

export default router;
