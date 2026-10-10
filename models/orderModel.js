const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  items: [
    {
      menuItem: {
        type: mongoose.Schema.ObjectId,
        ref: 'MenuItem',
        required: [true, 'An order item must have a menu item']
      },
      name: String,
      price: Number,
      quantity: {
        type: Number,
        min: 1
      }
    }
  ],
  totalAmount: {
    type: Number,
    required: [true, 'An order must have a total amount']
  },
  status: {
    type: String,
    enum: ['paid', 'preparing', 'ready', 'collected', 'cancelled'],
    default: 'paid'
  },
  pickupCode: {
    type: String,
    required: [true, 'An order must have a pickup code']
  },
  paymentStatus: {
    type: String,
    enum: ['paid', 'refunded'],
    default: 'paid'
  },
  stripeSessionId: {
    type: String,
    unique: true
  },
  stripePaymentIntent: String,
  user: {
    type: mongoose.Schema.ObjectId,
    ref: 'User',
    required: [true, 'An order must belong to a user']
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

orderSchema.index({ status: 1, createdAt: 1 });

orderSchema.pre(/^find/, function(next) {
  this.populate({
    path: 'user',
    select: 'name'
  });
  next();
});

const Order = mongoose.model('Order', orderSchema);

module.exports = Order;
