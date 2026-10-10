const mongoose = require('mongoose');
const slugify = require('slugify');

const menuItemSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'A menu item must have a name'],
      unique: true,
      trim: true,
      maxlength: [40, 'A menu item name must have at most 40 characters']
    },
    slug: String,
    category: {
      type: String,
      required: [true, 'A menu item must have a category'],
      enum: {
        values: ['snacks', 'meals', 'beverages', 'desserts'],
        message: 'Category is either: snacks, meals, beverages or desserts'
      }
    },
    price: {
      type: Number,
      required: [true, 'A menu item must have a price'],
      min: [1, 'Price must be at least 1']
    },
    isVeg: {
      type: Boolean,
      required: [true, 'Please say if the menu item is veg or non-veg']
    },
    image: {
      type: String,
      default: 'default.jpg'
    },
    isAvailable: {
      type: Boolean,
      default: true
    },
    prepTimeMinutes: {
      type: Number,
      default: 10,
      min: [1, 'Preparation time must be at least 1 minute']
    },
    ratingsAverage: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
      set: val => Math.round(val * 10) / 10
    },
    ratingsQuantity: {
      type: Number,
      default: 0
    },
    createdAt: {
      type: Date,
      default: Date.now,
      select: false
    }
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

menuItemSchema.index({ category: 1, price: 1 });

menuItemSchema.virtual('ratings', {
  ref: 'Rating',
  foreignField: 'menuItem',
  localField: '_id'
});

menuItemSchema.pre('save', function(next) {
  this.slug = slugify(this.name, { lower: true });
  next();
});

const MenuItem = mongoose.model('MenuItem', menuItemSchema);

module.exports = MenuItem;
