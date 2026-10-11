const { test, before, after } = require('node:test');
const assert = require('node:assert');
const dotenv = require('dotenv');

dotenv.config({ path: './config.env' });
process.env.NODE_ENV = 'test';
process.env.DATABASE = 'mongodb://127.0.0.1:27017/queueless_test';
process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_test_secret';
process.env.CANTEEN_OPENS = '00:00';
process.env.CANTEEN_CLOSES = '24:00';
process.env.EMAIL_HOST = '127.0.0.1';
process.env.EMAIL_PORT = '1';

const mongoose = require('mongoose');
const crypto = require('crypto');
const app = require('./../app');
const MenuItem = require('./../models/menuItemModel');
const User = require('./../models/userModel');
const Order = require('./../models/orderModel');
const Rating = require('./../models/ratingModel');

let server;
let baseUrl;
const tokens = {};
const users = {};
const items = {};

const api = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` })
    },
    body: body && JSON.stringify(body)
  });
  return { status: res.status, body: await res.json() };
};

const sendWebhook = (
  paymentLink,
  secret = process.env.RAZORPAY_WEBHOOK_SECRET
) => {
  const payload = JSON.stringify({
    event: 'payment_link.paid',
    payload: {
      payment_link: { entity: paymentLink },
      payment: { entity: { id: 'pay_test_123' } }
    }
  });
  return fetch(`${baseUrl}/webhook-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
    },
    body: payload
  });
};

before(async () => {
  await mongoose.connect(process.env.DATABASE);
  await mongoose.connection.dropDatabase();
  await MenuItem.syncIndexes();
  await Rating.syncIndexes();
  await Order.syncIndexes();

  items.dosa = await MenuItem.create({
    name: 'Masala Dosa',
    category: 'meals',
    price: 50,
    isVeg: true
  });
  items.biryani = await MenuItem.create({
    name: 'Chicken Biryani',
    category: 'meals',
    price: 120,
    isVeg: false
  });
  items.iceCream = await MenuItem.create({
    name: 'Ice Cream Cup',
    category: 'desserts',
    price: 30,
    isVeg: true,
    isAvailable: false
  });

  for (const role of ['student', 'staff', 'admin']) {
    users[role] = await User.create({
      name: `Test ${role}`,
      email: `${role}@test.dev`,
      role,
      password: 'test1234',
      passwordConfirm: 'test1234'
    });
  }
  users.otherStudent = await User.create({
    name: 'Other Student',
    email: 'other@test.dev',
    password: 'test1234',
    passwordConfirm: 'test1234'
  });

  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;

  for (const [key, user] of Object.entries(users)) {
    const res = await api('POST', '/api/v1/users/login', {
      body: { email: user.email, password: 'test1234' }
    });
    tokens[key] = res.body.token;
  }
});

after(async () => {
  server.close();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
});

test('login fails with a wrong password', async () => {
  const res = await api('POST', '/api/v1/users/login', {
    body: { email: 'student@test.dev', password: 'wrong-password' }
  });
  assert.strictEqual(res.status, 401);
});

test('menu hides sold-out items from students but not from staff', async () => {
  const publicMenu = await api('GET', '/api/v1/menu?sort=price');
  assert.deepStrictEqual(
    publicMenu.body.data.data.map(el => el.name),
    ['Masala Dosa', 'Chicken Biryani']
  );

  const staffMenu = await api('GET', '/api/v1/menu', { token: tokens.staff });
  assert.strictEqual(staffMenu.body.results, 3);
});

test('menu supports filtering, ranges and search', async () => {
  const veg = await api('GET', '/api/v1/menu?isVeg=true');
  assert.deepStrictEqual(veg.body.data.data.map(el => el.name), [
    'Masala Dosa'
  ]);

  const cheap = await api('GET', '/api/v1/menu?price[lte]=60');
  assert.strictEqual(cheap.body.results, 1);

  const search = await api('GET', '/api/v1/menu?search=biry');
  assert.strictEqual(search.body.data.data[0].name, 'Chicken Biryani');
});

test('staff can only toggle availability', async () => {
  const priceChange = await api('PATCH', `/api/v1/menu/${items.dosa.id}`, {
    token: tokens.staff,
    body: { price: 1 }
  });
  assert.strictEqual(priceChange.status, 403);

  const soldOut = await api('PATCH', `/api/v1/menu/${items.dosa.id}`, {
    token: tokens.staff,
    body: { isAvailable: false }
  });
  assert.strictEqual(soldOut.status, 200);
  assert.strictEqual(soldOut.body.data.data.isAvailable, false);

  await MenuItem.findByIdAndUpdate(items.dosa.id, { isAvailable: true });
});

test('students can not reach the staff queue', async () => {
  const res = await api('GET', '/api/v1/orders/queue', {
    token: tokens.student
  });
  assert.strictEqual(res.status, 403);
});

test('full order flow: webhook, queue, status, pickup code, rating, report', async () => {
  const paymentLink = {
    id: 'plink_test_123',
    status: 'paid',
    amount_paid: 22000,
    notes: {
      user: users.student.id,
      items0: `${items.dosa.id}:2:50,${items.biryani.id}:1`,
      items1: ':120'
    }
  };

  const badSignature = await sendWebhook(paymentLink, 'wrong_secret');
  assert.strictEqual(badSignature.status, 400);

  assert.strictEqual((await sendWebhook(paymentLink)).status, 200);
  assert.strictEqual((await sendWebhook(paymentLink)).status, 200);
  assert.strictEqual(await Order.countDocuments(), 1);

  const queue = await api('GET', '/api/v1/orders/queue', {
    token: tokens.staff
  });
  assert.strictEqual(queue.body.results, 1);
  const order = queue.body.data.data[0];
  assert.strictEqual(order.totalAmount, 220);
  assert.strictEqual(order.pickupCode, undefined);

  const ownView = await api('GET', `/api/v1/orders/${order._id}`, {
    token: tokens.student
  });
  const { pickupCode } = ownView.body.data.data;
  assert.match(pickupCode, /^\d{4}$/);

  const otherView = await api('GET', `/api/v1/orders/${order._id}`, {
    token: tokens.otherStudent
  });
  assert.strictEqual(otherView.status, 403);

  const setStatus = body =>
    api('PATCH', `/api/v1/orders/${order._id}/status`, {
      token: tokens.staff,
      body
    });

  assert.strictEqual((await setStatus({ status: 'ready' })).status, 400);
  assert.strictEqual((await setStatus({ status: 'preparing' })).status, 200);

  process.env.PAYMENT_MODE = 'demo';
  const demo = await api('POST', '/api/v1/orders/checkout-session', {
    token: tokens.student,
    body: { items: [{ menuItem: items.biryani.id, quantity: 2 }] }
  });
  delete process.env.PAYMENT_MODE;
  assert.strictEqual(demo.status, 201);
  assert.strictEqual(demo.body.data.data.totalAmount, 240);
  const demoCancel = await api(
    'PATCH',
    `/api/v1/orders/${demo.body.data.data._id}/cancel`,
    { token: tokens.student }
  );
  assert.strictEqual(demoCancel.body.data.data.status, 'cancelled');

  const lateCancel = await api('PATCH', `/api/v1/orders/${order._id}/cancel`, {
    token: tokens.student
  });
  assert.strictEqual(lateCancel.status, 400);

  assert.strictEqual((await setStatus({ status: 'ready' })).status, 200);
  const wrongCode = pickupCode === '0000' ? '1111' : '0000';
  assert.strictEqual(
    (await setStatus({ status: 'collected', pickupCode: wrongCode })).status,
    400
  );
  assert.strictEqual(
    (await setStatus({ status: 'collected', pickupCode })).status,
    200
  );

  const rating = await api('POST', `/api/v1/menu/${items.dosa.id}/ratings`, {
    token: tokens.student,
    body: { rating: 4, comment: 'Crispy' }
  });
  assert.strictEqual(rating.status, 201);

  const duplicate = await api('POST', `/api/v1/menu/${items.dosa.id}/ratings`, {
    token: tokens.student,
    body: { rating: 5 }
  });
  assert.strictEqual(duplicate.status, 400);

  const notCollected = await api(
    'POST',
    `/api/v1/menu/${items.dosa.id}/ratings`,
    { token: tokens.otherStudent, body: { rating: 1 } }
  );
  assert.strictEqual(notCollected.status, 403);

  const ratingId = rating.body.data.data._id;
  const otherEdit = await api('PATCH', `/api/v1/ratings/${ratingId}`, {
    token: tokens.otherStudent,
    body: { rating: 1 }
  });
  assert.strictEqual(otherEdit.status, 403);

  const dosa = await api('GET', `/api/v1/menu/${items.dosa.id}`);
  assert.strictEqual(dosa.body.data.data.ratingsAverage, 4);
  assert.strictEqual(dosa.body.data.data.ratings.length, 1);

  const report = await api('GET', '/api/v1/reports/sales', {
    token: tokens.admin
  });
  assert.strictEqual(report.body.data.totalRevenue, 220);
  assert.strictEqual(report.body.data.totalOrders, 1);
  assert.deepStrictEqual(report.body.data.topItems[0], {
    name: 'Masala Dosa',
    quantity: 2,
    revenue: 100
  });
});
