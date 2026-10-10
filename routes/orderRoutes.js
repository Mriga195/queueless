const express = require('express');
const orderController = require('./../controllers/orderController');
const authController = require('./../controllers/authController');

const router = express.Router();

router.use(authController.protect);

router.post(
  '/checkout-session',
  authController.restrictTo('student'),
  orderController.getCheckoutSession
);

router.get(
  '/my-orders',
  authController.restrictTo('student'),
  orderController.getMyOrders
);

router.get(
  '/queue',
  authController.restrictTo('staff'),
  orderController.getQueue
);

router.get('/:id', orderController.getOrder);

router.patch(
  '/:id/status',
  authController.restrictTo('staff'),
  orderController.updateOrderStatus
);

router.patch(
  '/:id/cancel',
  authController.restrictTo('student', 'admin'),
  orderController.cancelOrder
);

module.exports = router;
