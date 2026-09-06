
import { Router } from 'express';
import authRoutes from './auth.js';
import shopRoutes from './shop.js';
import cartRoutes from './cart.js';
import adminRoutes from './admin.js';
import { paymentMode } from '../services/checkout.js';

const router = Router();

router.get('/meta', (req, res) => res.json({
  name: 'LUMÉA API', version: '1.0.0',
  payments: paymentMode(), time: new Date().toISOString()
}));

router.use('/auth', authRoutes);
router.use(shopRoutes);        // /products · /fit · /reviews · /newsletter
router.use(cartRoutes);        // /cart · /checkout · /orders · /webhooks
router.use('/admin', adminRoutes);

export default router;
