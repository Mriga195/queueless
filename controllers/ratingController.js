const Rating = require('./../models/ratingModel');
const Order = require('./../models/orderModel');
const catchAsync = require('./../utils/catchAsync');
const AppError = require('./../utils/appError');
const filterObj = require('./../utils/filterObj');
const factory = require('./handlerFactory');

exports.setMenuItemUserIds = (req, res, next) => {
  if (!req.body.menuItem) req.body.menuItem = req.params.menuItemId;
  req.body.user = req.user.id;
  next();
};

exports.checkCollected = catchAsync(async (req, res, next) => {
  const order = await Order.findOne({
    user: req.user.id,
    status: 'collected',
    'items.menuItem': req.body.menuItem
  });

  if (!order) {
    return next(
      new AppError('You can only rate items you have ordered and collected.', 403)
    );
  }
  next();
});

exports.checkOwner = catchAsync(async (req, res, next) => {
  const rating = await Rating.findById(req.params.id);

  if (!rating) {
    return next(new AppError('No document found with that ID', 404));
  }

  if (rating.user.id !== req.user.id && req.user.role !== 'admin') {
    return next(new AppError('This is not your rating.', 403));
  }
  next();
});

exports.onlyRatingAndComment = (req, res, next) => {
  req.body = filterObj(req.body, 'rating', 'comment');
  next();
};

exports.getAllRatings = factory.getAll(Rating);
exports.getRating = factory.getOne(Rating);
exports.createRating = factory.createOne(Rating);
exports.updateRating = factory.updateOne(Rating);
exports.deleteRating = factory.deleteOne(Rating);
