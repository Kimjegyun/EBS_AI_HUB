import { Router } from 'express';
import { UserController } from '../controllers/user.controller';
import { authenticate, authorize } from '../middleware/auth';

const router = Router();
const controller = new UserController();

router.use(authenticate);
router.get('/', authorize('admin'), controller.getUsers);
router.get('/:id', controller.getUserById);
router.put('/:id', controller.updateUser);
router.delete('/:id', authorize('admin'), controller.deleteUser);
router.post('/:id/approve', authorize('admin'), controller.approveUser);
router.post('/:id/reject', authorize('admin'), controller.rejectUser);

export default router;
