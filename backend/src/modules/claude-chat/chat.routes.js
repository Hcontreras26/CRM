import { Router } from 'express';
import { verifyToken } from '../../shared/middleware/auth.js';
import { puede } from '../../shared/middleware/permissions.js';
import * as ctrl from './chat.controller.js';

const router = Router();
router.use(verifyToken);

router.get('/status', puede('chat_ia.usar'), ctrl.status);
router.get('/conversations', puede('chat_ia.usar'), ctrl.listConversations);
router.get('/conversations/:conversationId', puede('chat_ia.usar'), ctrl.getMessages);
router.post('/chat', puede('chat_ia.usar'), ctrl.chat);

export default router;
