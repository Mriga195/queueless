const multer = require('multer');
const sharp = require('sharp');
const MenuItem = require('./../models/menuItemModel');
const catchAsync = require('./../utils/catchAsync');
const factory = require('./handlerFactory');
const AppError = require('./../utils/appError');

const multerStorage = multer.memoryStorage();

const multerFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image')) {
    cb(null, true);
  } else {
    cb(new AppError('Not an image! Please upload only images.', 400), false);
  }
};

const upload = multer({
  storage: multerStorage,
  fileFilter: multerFilter
});

exports.uploadItemImage = upload.single('image');

exports.resizeItemImage = catchAsync(async (req, res, next) => {
  if (!req.file) return next();

  req.body.image = `item-${Date.now()}.jpeg`;

  await sharp(req.file.buffer)
    .resize(600, 400)
    .toFormat('jpeg')
    .jpeg({ quality: 80 })
    .toFile(`public/img/menu/${req.body.image}`);

  next();
});

exports.hideSoldOutForStudents = (req, res, next) => {
  if (!req.user || req.user.role === 'student') {
    req.query.isAvailable = 'true';
  }
  next();
};

exports.staffCanOnlyChangeAvailability = (req, res, next) => {
  const changesOtherFields = Object.keys(req.body).some(
    field => field !== 'isAvailable'
  );

  if (req.user.role === 'staff' && (changesOtherFields || req.file)) {
    return next(
      new AppError('Staff can only mark items as sold out or available.', 403)
    );
  }
  next();
};

exports.getAllItems = factory.getAll(MenuItem);
exports.getItem = factory.getOne(MenuItem, { path: 'ratings' });
exports.createItem = factory.createOne(MenuItem);
exports.updateItem = factory.updateOne(MenuItem);
exports.deleteItem = factory.deleteOne(MenuItem);
