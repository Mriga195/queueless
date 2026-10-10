const crypto = require('crypto');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const MenuItem = require('./../models/menuItemModel');
const Order = require('./../models/orderModel');
const User = require('./../models/userModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const APIFeatures = require('./../utils/apiFeatures');
const Email = require('./../utils/email');

const nextStatus = {
  paid: 'preparing',
  preparing: 'ready',
  ready: 'collected'
};

const isCanteenOpen = () => {
  const timeNow = new Date().toLocaleTimeString('en-GB', {
    timeZone: process.env.CANTEEN_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  });

  return (
    timeNow >= process.env.CANTEEN_OPENS && timeNow < process.env.CANTEEN_CLOSES
  );
};

const sendEmailInBackground = (user, url, sendFunction) => {
  sendFunction(new Email(user, url)).catch(err =>
    console.log('EMAIL ERROR 💥', err.message)
  );
};

exports.getCheckoutSession = catchAsync(async (req, res, next) => {
  const { items } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return next(new AppError('Your cart is empty.', 400));
  }

  if (items.length > 15) {
    return next(
      new AppError('You can order at most 15 different items at once.', 400)
    );
  }

  if (!isCanteenOpen()) {
    return next(
      new AppError(
        `The canteen is closed. It is open from ${process.env.CANTEEN_OPENS} to ${process.env.CANTEEN_CLOSES}.`,
        503
      )
    );
  }

  const menuItems = await MenuItem.find({
    _id: { $in: items.map(el => el.menuItem) }
  });

  const cart = [];
  for (const el of items) {
    const menuItem = menuItems.find(doc => doc.id === el.menuItem);
    const quantity = Number(el.quantity);

    if (!menuItem) {
      return next(new AppError(`No menu item with ID ${el.menuItem}.`, 400));
    }
    if (!menuItem.isAvailable) {
      return next(new AppError(`${menuItem.name} is sold out.`, 400));
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      return next(new AppError('Quantity must be at least 1.', 400));
    }

    cart.push({ menuItem, quantity });
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: `${process.env.FRONTEND_URL}/orders?payment=success`,
    cancel_url: `${process.env.FRONTEND_URL}/cart`,
    customer_email: req.user.email,
    client_reference_id: req.user.id,
    metadata: {
      items: cart
        .map(el => `${el.menuItem.id}:${el.quantity}:${el.menuItem.price}`)
        .join(',')
    },
    line_items: cart.map(el => ({
      quantity: el.quantity,
      price_data: {
        currency: process.env.CURRENCY,
        unit_amount: Math.round(el.menuItem.price * 100),
        product_data: { name: el.menuItem.name }
      }
    }))
  });

  res.status(200).json({
    status: 'success',
    session: {
      id: session.id,
      url: session.url
    }
  });
});

const createOrderCheckout = async session => {
  const orderExists = await Order.findOne({ stripeSessionId: session.id });
  if (orderExists) return;

  const lines = session.metadata.items.split(',').map(el => el.split(':'));
  const menuItems = await MenuItem.find({
    _id: { $in: lines.map(([menuItemId]) => menuItemId) }
  });

  const items = lines.map(([menuItemId, quantity, price]) => {
    const menuItem = menuItems.find(doc => doc.id === menuItemId);
    return {
      menuItem: menuItemId,
      name: menuItem ? menuItem.name : 'Deleted item',
      quantity: Number(quantity),
      price: Number(price)
    };
  });

  const order = await Order.create({
    user: session.client_reference_id,
    items,
    totalAmount: session.amount_total / 100,
    pickupCode: crypto
      .randomInt(0, 10000)
      .toString()
      .padStart(4, '0'),
    stripeSessionId: session.id,
    stripePaymentIntent: session.payment_intent
  });

  const user = await User.findById(session.client_reference_id);
  if (user) {
    sendEmailInBackground(user, `${process.env.FRONTEND_URL}/orders`, email =>
      email.sendOrderConfirmation(order)
    );
  }
};

exports.webhookCheckout = catchAsync(async (req, res, next) => {
  const signature = req.headers['stripe-signature'];

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (
    event.type === 'checkout.session.completed' &&
    event.data.object.payment_status === 'paid'
  ) {
    await createOrderCheckout(event.data.object);
  }

  res.status(200).json({ received: true });
});

exports.getMyOrders = catchAsync(async (req, res, next) => {
  const features = new APIFeatures(Order.find({ user: req.user.id }), req.query)
    .filter()
    .sort()
    .limitFields()
    .paginate();
  const orders = await features.query;

  res.status(200).json({
    status: 'success',
    results: orders.length,
    data: {
      data: orders
    }
  });
});

exports.getQueue = catchAsync(async (req, res, next) => {
  const filter = req.query.status
    ? { status: req.query.status }
    : { status: { $in: ['paid', 'preparing'] } };

  const orders = await Order.find(filter)
    .sort('createdAt')
    .select('-pickupCode -__v');

  res.status(200).json({
    status: 'success',
    results: orders.length,
    data: {
      data: orders
    }
  });
});

exports.getOrder = catchAsync(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new AppError('No order found with that ID', 404));
  }

  const isOwner = order.user.id === req.user.id;

  if (req.user.role === 'student' && !isOwner) {
    return next(new AppError('This is not your order.', 403));
  }

  if (!isOwner) order.pickupCode = undefined;

  res.status(200).json({
    status: 'success',
    data: {
      data: order
    }
  });
});

exports.updateOrderStatus = catchAsync(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new AppError('No order found with that ID', 404));
  }

  const allowedStatus = nextStatus[order.status];

  if (req.body.status !== allowedStatus) {
    return next(
      new AppError(
        `This order is ${order.status}. It can only move to ${allowedStatus ||
          'no other status'}.`,
        400
      )
    );
  }

  if (
    req.body.status === 'collected' &&
    String(req.body.pickupCode) !== order.pickupCode
  ) {
    return next(new AppError('Wrong pickup code.', 400));
  }

  order.status = req.body.status;
  await order.save();

  if (order.status === 'ready') {
    const user = await User.findById(order.user.id);
    if (user) {
      sendEmailInBackground(user, `${process.env.FRONTEND_URL}/orders`, email =>
        email.sendOrderReady(order)
      );
    }
  }

  order.pickupCode = undefined;

  res.status(200).json({
    status: 'success',
    data: {
      data: order
    }
  });
});

exports.cancelOrder = catchAsync(async (req, res, next) => {
  const order = await Order.findById(req.params.id);

  if (!order) {
    return next(new AppError('No order found with that ID', 404));
  }

  if (req.user.role === 'student' && order.user.id !== req.user.id) {
    return next(new AppError('This is not your order.', 403));
  }

  if (order.status !== 'paid') {
    return next(
      new AppError(
        'You can only cancel an order before the canteen starts preparing it.',
        400
      )
    );
  }

  await stripe.refunds.create({ payment_intent: order.stripePaymentIntent });

  order.status = 'cancelled';
  order.paymentStatus = 'refunded';
  await order.save();

  res.status(200).json({
    status: 'success',
    data: {
      data: order
    }
  });
});
