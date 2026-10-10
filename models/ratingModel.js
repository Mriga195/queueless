const mongoose = require('mongoose');
const MenuItem = require('./menuItemModel');

const ratingSchema = new mongoose.Schema(
  {
    rating: {
      type: Number,
      required: [true, 'Please give a rating from 1 to 5'],
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating must be at most 5']
    },
    comment: {
      type: String,
      trim: true,
      maxlength: [300, 'A comment must have at most 300 characters']
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    menuItem: {
      type: mongoose.Schema.ObjectId,
      ref: 'MenuItem',
      required: [true, 'A rating must belong to a menu item']
    },
    user: {
      type: mongoose.Schema.ObjectId,
      ref: 'User',
      required: [true, 'A rating must belong to a user']
    }
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

ratingSchema.index({ menuItem: 1, user: 1 }, { unique: true });

ratingSchema.pre(/^find/, function(next) {
  this.populate({
    path: 'user',
    select: 'name photo'
  });
  next();
});

ratingSchema.statics.calcAverageRatings = async function(menuItemId) {
  const stats = await this.aggregate([
    {
      $match: { menuItem: menuItemId }
    },
    {
      $group: {
        _id: '$menuItem',
        nRating: { $sum: 1 },
        avgRating: { $avg: '$rating' }
      }
    }
  ]);

  if (stats.length > 0) {
    await MenuItem.findByIdAndUpdate(menuItemId, {
      ratingsQuantity: stats[0].nRating,
      ratingsAverage: stats[0].avgRating
    });
  } else {
    await MenuItem.findByIdAndUpdate(menuItemId, {
      ratingsQuantity: 0,
      ratingsAverage: 0
    });
  }
};

ratingSchema.post('save', async function() {
  await this.constructor.calcAverageRatings(this.menuItem);
});

ratingSchema.post(/^findOneAnd/, async function(doc) {
  if (doc) await doc.constructor.calcAverageRatings(doc.menuItem);
});

const Rating = mongoose.model('Rating', ratingSchema);

module.exports = Rating;
