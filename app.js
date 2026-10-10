const path = require('path');
const express = require('express');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const cors = require('cors');

const AppError = require('./utils/appError');
const globalErrorHandler = require('./controllers/errorController');
const menuRouter = require('./routes/menuRoutes');
const userRouter = require('./routes/userRoutes');
const ratingRouter = require('./routes/ratingRoutes');
const orderRouter = require('./routes/orderRoutes');
const reportRouter = require('./routes/reportRoutes');
const orderController = require('./controllers/orderController');

const app = express();

app.set('trust proxy', 1);

const corsOptions = {
  origin: process.env.FRONTEND_URL,
  credentials: true
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

app.use(express.static(path.join(__dirname, 'public')));

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

const limiter = rateLimit({
  max: 100,
  windowMs: 60 * 60 * 1000,
  message: {
    status: 'fail',
    message: 'Too many requests from this IP, please try again in an hour!'
  }
});
app.use('/api', limiter);

app.post(
  '/webhook-checkout',
  express.raw({ type: 'application/json' }),
  orderController.webhookCheckout
);

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

app.use(mongoSanitize());

app.use(xss());

app.use(
  hpp({
    whitelist: [
      'price',
      'category',
      'isVeg',
      'prepTimeMinutes',
      'ratingsAverage',
      'ratingsQuantity'
    ]
  })
);

app.use(compression());

app.use('/api/v1/menu', menuRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/ratings', ratingRouter);
app.use('/api/v1/orders', orderRouter);
app.use('/api/v1/reports', reportRouter);

app.all('*', (req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

app.use(globalErrorHandler);

module.exports = app;
