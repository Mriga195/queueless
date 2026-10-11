const crypto = require('crypto');
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

const razorpay = async (path, body) => {
  const keys = `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`;
  const res = await fetch(`https://api.razorpay.com/v1${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(keys).toString('base64')}`
    },
    body: JSON.stringify(body)
  });
  const data = await res.json();

  if (!res.ok) {
    throw new AppError(`Payment error: ${data.error.description}`, 502);
  }
  return data;
};

const sendEmailInBackground = (user, url, sendFunction) => {
  sendFunction(new Email(user, url)).catch(err =>
    console.log('EMAIL ERROR 💥', err.message)
  );
};

const createOrderCheckout = async (paymentLink, payment) => {
  const orderExists = await Order.findOne({ paymentLinkId: paymentLink.id });
  if (orderExists) return;

  let cartText = '';
  for (let i = 0; paymentLink.notes[`items${i}`]; i += 1) {
    cartText += paymentLink.notes[`items${i}`];
  }

  const lines = cartText.split(',').map(el => el.split(':'));
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
    user: paymentLink.notes.user,
    items,
    totalAmount: paymentLink.amount_paid / 100,
    pickupCode: crypto
      .randomInt(0, 10000)
      .toString()
      .padStart(4, '0'),
    paymentLinkId: paymentLink.id,
    paymentId: payment.id
  });

  const user = await User.findById(paymentLink.notes.user);
  if (user) {
    sendEmailInBackground(user, `${process.env.FRONTEND_URL}/orders`, email =>
      email.sendOrderConfirmation(order)
    );
  }

  return order;
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

  // Razorpay notes values are capped at 256 characters, so the cart is split
  const cartText = cart
    .map(el => `${el.menuItem.id}:${el.quantity}:${el.menuItem.price}`)
    .join(',');
  const notes = { user: req.user.id };
  for (let i = 0; i * 250 < cartText.length; i += 1) {
    notes[`items${i}`] = cartText.slice(i * 250, (i + 1) * 250);
  }

  const amount = cart.reduce(
    (sum, el) => sum + Math.round(el.menuItem.price * 100) * el.quantity,
    0
  );

  // Demo mode: no payment gateway, the order is created as if it was paid
  if (process.env.PAYMENT_MODE === 'demo') {
    const order = await createOrderCheckout(
      { id: `demo_${crypto.randomUUID()}`, amount_paid: amount, notes },
      {}
    );

    return res.status(201).json({
      status: 'success',
      session: {
        id: order.paymentLinkId,
        url: `${process.env.FRONTEND_URL}/orders?payment=success`
      },
      data: {
        data: order
      }
    });
  }

  const paymentLink = await razorpay('/payment_links', {
    amount,
    currency: process.env.CURRENCY.toUpperCase(),
    description: 'QueueLess canteen order',
    customer: { email: req.user.email },
    notify: { sms: false, email: false },
    callback_url: `${process.env.FRONTEND_URL}/orders?payment=success`,
    callback_method: 'get',
    notes
  });

  res.status(200).json({
    status: 'success',
    session: {
      id: paymentLink.id,
      url: paymentLink.short_url
    }
  });
});

exports.webhookCheckout = catchAsync(async (req, res, next) => {
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
    .update(req.body)
    .digest();
  const signature = Buffer.from(
    String(req.headers['x-razorpay-signature']),
    'hex'
  );

  if (
    signature.length !== expected.length ||
    !crypto.timingSafeEqual(signature, expected)
  ) {
    return res.status(400).send('Webhook error: invalid signature');
  }

  const event = JSON.parse(req.body);

  if (
    event.event === 'payment_link.paid' &&
    event.payload.payment_link.entity.status === 'paid'
  ) {
    await createOrderCheckout(
      event.payload.payment_link.entity,
      event.payload.payment.entity
    );
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

  if (order.paymentId) {
    await razorpay(`/payments/${order.paymentId}/refund`, {});
  }

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
