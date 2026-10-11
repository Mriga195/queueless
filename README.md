# QueueLess

Canteen pre-order and pickup backend. Students order and pay ahead, staff work through a live queue, and students collect with a 4-digit pickup code instead of standing in line.

**Live API:** https://queueless-bywb.onrender.com (free plan: the first request after a while takes ~50 s to wake up)

Built with Node.js, Express, MongoDB (Mongoose), JWT auth, Razorpay payment links and Brevo email.

## Features

- **Roles:** student, staff, admin
- **Menu:** filtering, sorting, price ranges, search, images; sold-out items hidden from students
- **Orders:** checkout only during canteen hours, paid → preparing → ready → collected, pickup code checked at collection, cancel with refund before preparation starts
- **Emails:** welcome, password reset, order confirmed, order ready
- **Ratings:** only for items the student has collected, one per item
- **Sales report:** revenue, order count and top items over a date range
- **Security:** helmet, rate limiting, NoSQL injection and XSS sanitizing, HPP, signed payment webhooks

## Order flow

1. Student calls `POST /api/v1/orders/checkout-session` and pays on the returned `session.url`.
2. Razorpay calls `/webhook-checkout`; the order is created as `paid` with a pickup code and a confirmation email.
3. Staff see it in `GET /api/v1/orders/queue` and move it to `preparing`, then `ready` (student gets an email).
4. Student shows the pickup code; staff set `collected` with that code.

**Demo mode:** with `PAYMENT_MODE=demo`, checkout skips the gateway and creates the order immediately (201). The live deployment runs in demo mode.

## Setup

Requires Node.js 20+ and MongoDB.

```bash
npm install
# create config.env (see below)
npm run import   # load sample menu and users (npm run delete to clear)
npm run dev      # http://localhost:3000
npm test         # integration tests, use mongodb://127.0.0.1:27017/queueless_test
```

Sample users (password `test1234`): `admin@queueless.dev`, `staff@queueless.dev`, `student@queueless.dev`.

## Environment variables (`config.env`)

| Variable | Example / notes |
| --- | --- |
| `NODE_ENV` | `development` or `production` (production sends email through Brevo) |
| `PORT` | `3000` (do not set on Render) |
| `DATABASE` | MongoDB connection string |
| `JWT_SECRET` | long random string |
| `JWT_EXPIRES_IN` | `7d` |
| `JWT_COOKIE_EXPIRES_IN` | `7` (days) |
| `FRONTEND_URL` | used in email links and payment redirects |
| `CANTEEN_OPENS` / `CANTEEN_CLOSES` | `08:00` / `18:00` |
| `CANTEEN_TIMEZONE` | `Asia/Kolkata` |
| `CURRENCY` | `inr` |
| `PAYMENT_MODE` | `demo` to skip the payment gateway; leave unset to use Razorpay |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | Razorpay API keys |
| `RAZORPAY_WEBHOOK_SECRET` | secret of the webhook to `/webhook-checkout`, event `payment_link.paid` |
| `EMAIL_FROM` | verified sender address |
| `BREVO_API_KEY` | production email |
| `EMAIL_HOST` / `EMAIL_PORT` / `EMAIL_USERNAME` / `EMAIL_PASSWORD` | development SMTP (e.g. Mailtrap) |

## API

All routes are under `/api/v1`. Send the JWT from login as `Authorization: Bearer <token>`. A full Postman collection is in `QueueLess.postman_collection.json`.

| Method | Route | Access |
| --- | --- | --- |
| POST | `/users/signup`, `/users/login` | public |
| GET | `/users/logout` | public |
| POST | `/users/forgotPassword` | public |
| PATCH | `/users/resetPassword/:token` | public |
| GET | `/users/me` | logged in |
| PATCH | `/users/updateMe`, `/users/updateMyPassword` | logged in |
| GET, POST | `/users` | admin |
| GET, PATCH, DELETE | `/users/:id` | admin |
| GET | `/menu`, `/menu/:id` | public |
| POST | `/menu` | admin |
| PATCH | `/menu/:id` | staff (availability only), admin |
| DELETE | `/menu/:id` | admin |
| GET | `/menu/:menuItemId/ratings`, `/ratings`, `/ratings/:id` | public |
| POST | `/menu/:menuItemId/ratings` | student (collected items only) |
| PATCH | `/ratings/:id` | student (own) |
| DELETE | `/ratings/:id` | student (own), admin |
| POST | `/orders/checkout-session` | student |
| GET | `/orders/my-orders` | student |
| GET | `/orders/queue` | staff |
| GET | `/orders/:id` | owner, staff, admin |
| PATCH | `/orders/:id/status` | staff |
| PATCH | `/orders/:id/cancel` | student (own), admin |
| GET | `/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD` | admin |

Menu lists support `?sort=price`, `?fields=name,price`, `?page=2&limit=10`, `?price[lte]=60`, `?isVeg=true` and `?search=dosa`.

## Deployment

Deployed on Render (Web Service, build `npm install`, start `npm start`) with MongoDB Atlas. Set the environment variables above in Render; Render provides `PORT`.
